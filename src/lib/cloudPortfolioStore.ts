import type { PersistedPortfolioV1 } from './persistence';
import { normalizeLoadedPortfolio } from './portfolioBootstrap';
import { normalizeKrSellCommissionRate } from './krTradingAssumptions';
import {
  createCloudPortfolioSnapshot,
  fetchCloudLivePortfolio,
  fetchCloudPortfolio,
  fetchCloudPortfolioMeta,
  fetchCloudPortfolioSnapshot,
  listCloudDeletedTodos,
  listCloudDeletedTrades,
  listCloudPortfolioSnapshots,
  pushCloudPortfolio,
  restoreCloudDeletedTodo,
  restoreCloudDeletedTrade,
  subscribeCloudPortfolioMeta,
  subscribeCloudTodos,
  subscribeCloudTrades,
  syncCloudPortfolioMeta,
  syncCloudTodos,
  syncCloudTrades,
  type CloudDeletedTodoRecord,
  type CloudDeletedTradeRecord,
  type CloudPortfolioMeta,
  type CloudPortfolioSnapshotSummary,
} from './cloudPortfolio';
import type { Trade } from '../types/trade';
import type { TradePlanTodo } from '../types/todo';

export type {
  CloudDeletedTodoRecord,
  CloudDeletedTradeRecord,
  CloudPortfolioSnapshotSummary,
} from './cloudPortfolio';

export type CloudPortfolioMetaInput = Omit<CloudPortfolioMeta, 'updatedAtMs'>;

export interface CloudRecoveryItems {
  snapshots: CloudPortfolioSnapshotSummary[];
  deletedTrades: CloudDeletedTradeRecord[];
  deletedTodos: CloudDeletedTodoRecord[];
}

export interface CloudBootstrapResult {
  portfolio: PersistedPortfolioV1;
  shouldApplyPortfolio: boolean;
  remoteTradeRecords: Record<string, Trade>;
  remoteTodoRecords: Record<string, TradePlanTodo>;
  nextTradeFingerprints: Record<string, string>;
  nextTodoFingerprints: Record<string, string>;
  missingTradeDocs: Trade[];
  missingTodoDocs: TradePlanTodo[];
  staleTradeDeletes: Trade[];
  staleTodoDeletes: TradePlanTodo[];
  remoteMetaFingerprint: string;
}

function tradeFingerprint(trade: Trade): string {
  return JSON.stringify([
    trade.date,
    trade.ticker,
    trade.name,
    trade.sector,
    trade.market,
    trade.side,
    trade.quantity,
    trade.price,
    trade.currency,
    trade.note ?? null,
    trade.excludeFromJournal === true,
    trade.executionStatus ?? null,
  ]);
}

function todoFingerprint(todo: TradePlanTodo): string {
  return JSON.stringify([
    todo.market,
    todo.ticker,
    todo.name ?? null,
    todo.action,
    todo.targetPrice,
    todo.quantity,
    todo.note ?? null,
    todo.done,
    todo.createdAt,
  ]);
}

export function buildTradeFingerprintMap(trades: Trade[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const trade of trades) out[trade.id] = tradeFingerprint(trade);
  return out;
}

export function buildTradeRecordMap(trades: Trade[]): Record<string, Trade> {
  const out: Record<string, Trade> = {};
  for (const trade of trades) out[trade.id] = trade;
  return out;
}

export function buildTodoFingerprintMap(todos: TradePlanTodo[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const todo of todos) out[todo.id] = todoFingerprint(todo);
  return out;
}

export function buildTodoRecordMap(todos: TradePlanTodo[]): Record<string, TradePlanTodo> {
  const out: Record<string, TradePlanTodo> = {};
  for (const todo of todos) out[todo.id] = todo;
  return out;
}

function sameFingerprintMaps(
  a: Record<string, string>,
  b: Record<string, string>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function sameTradeLists(a: Trade[], b: Trade[]): boolean {
  return sameFingerprintMaps(buildTradeFingerprintMap(a), buildTradeFingerprintMap(b));
}

export function sameTodoLists(a: TradePlanTodo[], b: TradePlanTodo[]): boolean {
  return sameFingerprintMaps(buildTodoFingerprintMap(a), buildTodoFingerprintMap(b));
}

export function metaFingerprint(input: CloudPortfolioMetaInput): string {
  return JSON.stringify(input);
}

function reconcileTradesFromSources(args: {
  liveTrades: Trade[];
  fallbackTrades: Trade[];
}): Trade[] {
  const { liveTrades, fallbackTrades } = args;
  const map = new Map<string, Trade>();
  for (const trade of fallbackTrades) map.set(trade.id, trade);
  for (const trade of liveTrades) map.set(trade.id, trade);
  return [...map.values()].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function reconcileTodosFromSources(args: {
  liveTodos: TradePlanTodo[];
  fallbackTodos: TradePlanTodo[];
}): TradePlanTodo[] {
  const { liveTodos, fallbackTodos } = args;
  const map = new Map<string, TradePlanTodo>();
  for (const todo of fallbackTodos) map.set(todo.id, todo);
  for (const todo of liveTodos) map.set(todo.id, todo);
  return [...map.values()].sort((a, b) => {
    const d = a.createdAt.localeCompare(b.createdAt);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function pickMetaValue<T>(args: {
  remote: T | null | undefined;
  legacy: T | undefined;
  local: T;
  ignoreLegacy: boolean;
}): T {
  const { remote, legacy, local, ignoreLegacy } = args;
  if (remote !== null && remote !== undefined) return remote;
  if (ignoreLegacy) return local;
  return legacy ?? local;
}

function getMaxUpdatedAtMs(input: Record<string, number>): number {
  let max = 0;
  for (const value of Object.values(input)) {
    if (value > max) max = value;
  }
  return max;
}

export function buildCloudPortfolioMetaInput(
  portfolio: PersistedPortfolioV1,
): CloudPortfolioMetaInput {
  return {
    quotes: portfolio.quotes,
    positionIds: portfolio.positionIds,
    notes: portfolio.notes,
    quoteUpdatedAt: portfolio.quoteUpdatedAt,
    lastKrQuoteBulkAt: portfolio.lastKrQuoteBulkAt,
    krSellCommissionRate: normalizeKrSellCommissionRate(portfolio.krSellCommissionRate),
    krPreferExtendedQuote: portfolio.krPreferExtendedQuote === true,
    krDayOpenByTicker: portfolio.krDayOpenByTicker ?? {},
  };
}

export function portfolioGuardFingerprint(input: PersistedPortfolioV1): string {
  return JSON.stringify({
    trades: buildTradeFingerprintMap(input.trades),
    todos: buildTodoFingerprintMap(input.todos),
    meta: metaFingerprint(buildCloudPortfolioMetaInput(input)),
  });
}

async function loadBootstrap(args: {
  uid: string;
  localPortfolio: PersistedPortfolioV1;
  localPersistedAtMs: number;
}): Promise<CloudBootstrapResult> {
  const { uid, localPortfolio, localPersistedAtMs } = args;
  const [live, remoteMeta] = await Promise.all([
    fetchCloudLivePortfolio(uid),
    fetchCloudPortfolioMeta(uid),
  ]);
  const shouldUseLegacyMigration =
    live.trades.length === 0 && live.todos.length === 0 && remoteMeta == null;
  const legacySnapshot = shouldUseLegacyMigration ? await fetchCloudPortfolio(uid) : null;
  const normalizedLegacy = legacySnapshot
    ? normalizeLoadedPortfolio(legacySnapshot.portfolio)
    : null;

  const maxRemoteTradeUpdatedAtMs = getMaxUpdatedAtMs(live.tradeUpdatedAtMsById);
  const maxRemoteTodoUpdatedAtMs = getMaxUpdatedAtMs(live.todoUpdatedAtMsById);
  const maxRemoteMetaUpdatedAtMs = remoteMeta?.updatedAtMs ?? 0;

  const preferLocalTrades = localPersistedAtMs > maxRemoteTradeUpdatedAtMs;
  const preferLocalTodos = localPersistedAtMs > maxRemoteTodoUpdatedAtMs;
  const preferLocalMeta = localPersistedAtMs > maxRemoteMetaUpdatedAtMs;

  const fallbackTrades = preferLocalTrades
    ? localPortfolio.trades
    : (normalizedLegacy?.trades ?? localPortfolio.trades);
  const fallbackTodos = preferLocalTodos
    ? localPortfolio.todos
    : (normalizedLegacy?.todos ?? localPortfolio.todos);

  const nextTrades = reconcileTradesFromSources({
    liveTrades: live.trades,
    fallbackTrades,
  });
  const nextTodos = reconcileTodosFromSources({
    liveTodos: live.todos,
    fallbackTodos,
  });

  const nextMeta: CloudPortfolioMetaInput = {
    quotes: pickMetaValue({
      remote: remoteMeta?.quotes,
      legacy: normalizedLegacy?.quotes,
      local: localPortfolio.quotes,
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
    positionIds: pickMetaValue({
      remote: remoteMeta?.positionIds,
      legacy: normalizedLegacy?.positionIds,
      local: localPortfolio.positionIds,
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
    notes: pickMetaValue({
      remote: remoteMeta?.notes,
      legacy: normalizedLegacy?.notes,
      local: localPortfolio.notes,
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
    quoteUpdatedAt: pickMetaValue({
      remote: remoteMeta?.quoteUpdatedAt,
      legacy: normalizedLegacy?.quoteUpdatedAt,
      local: localPortfolio.quoteUpdatedAt,
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
    lastKrQuoteBulkAt: pickMetaValue({
      remote: remoteMeta?.lastKrQuoteBulkAt,
      legacy: normalizedLegacy?.lastKrQuoteBulkAt,
      local: localPortfolio.lastKrQuoteBulkAt,
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
    krSellCommissionRate: normalizeKrSellCommissionRate(
      pickMetaValue({
        remote: remoteMeta?.krSellCommissionRate,
        legacy: normalizedLegacy?.krSellCommissionRate,
        local: localPortfolio.krSellCommissionRate,
        ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
      }),
    ),
    krPreferExtendedQuote: pickMetaValue({
      remote: remoteMeta?.krPreferExtendedQuote,
      legacy: normalizedLegacy?.krPreferExtendedQuote,
      local: localPortfolio.krPreferExtendedQuote === true,
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
    krDayOpenByTicker: pickMetaValue({
      remote: remoteMeta?.krDayOpenByTicker,
      legacy: normalizedLegacy?.krDayOpenByTicker,
      local: localPortfolio.krDayOpenByTicker ?? {},
      ignoreLegacy: !shouldUseLegacyMigration || preferLocalMeta,
    }),
  };

  const remoteTradeFingerprints = buildTradeFingerprintMap(live.trades);
  const remoteTodoFingerprints = buildTodoFingerprintMap(live.todos);
  const remoteTradeRecords = buildTradeRecordMap(live.trades);
  const remoteTodoRecords = buildTodoRecordMap(live.todos);
  const nextTradeFingerprints = buildTradeFingerprintMap(nextTrades);
  const nextTodoFingerprints = buildTodoFingerprintMap(nextTodos);

  const staleTradeDeletes = Object.keys(remoteTradeFingerprints)
    .filter((id) => !(id in nextTradeFingerprints))
    .map((id) => remoteTradeRecords[id])
    .filter((trade): trade is Trade => Boolean(trade));
  const staleTodoDeletes = Object.keys(remoteTodoFingerprints)
    .filter((id) => !(id in nextTodoFingerprints))
    .map((id) => remoteTodoRecords[id])
    .filter((todo): todo is TradePlanTodo => Boolean(todo));

  const missingTradeDocs = nextTrades.filter(
    (trade) => remoteTradeFingerprints[trade.id] !== nextTradeFingerprints[trade.id],
  );
  const missingTodoDocs = nextTodos.filter(
    (todo) => remoteTodoFingerprints[todo.id] !== nextTodoFingerprints[todo.id],
  );

  const portfolio: PersistedPortfolioV1 = {
    ...localPortfolio,
    trades: nextTrades,
    todos: nextTodos,
    ...nextMeta,
  };

  return {
    portfolio,
    shouldApplyPortfolio: shouldUseLegacyMigration && normalizedLegacy !== null,
    remoteTradeRecords,
    remoteTodoRecords,
    nextTradeFingerprints,
    nextTodoFingerprints,
    missingTradeDocs,
    missingTodoDocs,
    staleTradeDeletes,
    staleTodoDeletes,
    remoteMetaFingerprint: remoteMeta
      ? metaFingerprint({
          quotes: remoteMeta.quotes,
          positionIds: remoteMeta.positionIds,
          notes: remoteMeta.notes,
          quoteUpdatedAt: remoteMeta.quoteUpdatedAt,
          lastKrQuoteBulkAt: remoteMeta.lastKrQuoteBulkAt,
          krSellCommissionRate: remoteMeta.krSellCommissionRate,
          krPreferExtendedQuote: remoteMeta.krPreferExtendedQuote,
          krDayOpenByTicker: remoteMeta.krDayOpenByTicker,
        })
      : '',
  };
}

async function listRecoveryItems(uid: string): Promise<CloudRecoveryItems> {
  const [snapshots, deletedTrades, deletedTodos] = await Promise.all([
    listCloudPortfolioSnapshots(uid),
    listCloudDeletedTrades(uid),
    listCloudDeletedTodos(uid),
  ]);
  return {
    snapshots,
    deletedTrades,
    deletedTodos,
  };
}

export const cloudPortfolioStore = {
  loadBootstrap,
  listRecoveryItems,
  createSnapshot: createCloudPortfolioSnapshot,
  fetchSnapshot: fetchCloudPortfolioSnapshot,
  restoreDeletedTrade: restoreCloudDeletedTrade,
  restoreDeletedTodo: restoreCloudDeletedTodo,
  pushLegacyBackup: pushCloudPortfolio,
  subscribeTrades: subscribeCloudTrades,
  subscribeTodos: subscribeCloudTodos,
  subscribeMeta: subscribeCloudPortfolioMeta,
  syncTrades: syncCloudTrades,
  syncTodos: syncCloudTodos,
  syncMeta: syncCloudPortfolioMeta,
};
