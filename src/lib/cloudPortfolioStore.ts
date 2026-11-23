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
import { idCreatedAtMs, withoutRedundantHiddenTrades } from './openingTrades';
import type { Trade } from '../types/trade';
import type { TradePlanTodo } from '../types/todo';

export { idCreatedAtMs } from './openingTrades';

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

/**
 * 클라우드에 없는 로컬 항목을 다시 올릴지.
 * 클라우드 장부가 이미 있으면, 이 브라우저가 그 장부를 받은 뒤에 만든 항목만 올린다.
 * 받은 시각이 없는 예전 저장본은 올리지 않는다.
 */
export function shouldKeepLocalOnlyRecord(args: {
  cloudHasRecords: boolean;
  acceptedCloudAtMs: number | null;
  createdAtMs: number | null;
  /** 이 브라우저가 클라우드에서 이 id를 본 적이 있으면, 지금 없는 것은 다른 기기 삭제다. */
  previouslySeen?: boolean;
}): boolean {
  if (args.previouslySeen) return false;
  if (!args.cloudHasRecords) return true;
  if (args.acceptedCloudAtMs == null || args.createdAtMs == null) return false;
  return args.createdAtMs > args.acceptedCloudAtMs;
}

export function reconcileTradesFromSources(args: {
  liveTrades: Trade[];
  fallbackTrades: Trade[];
  acceptedCloudAtMs: number | null;
  seenTradeIds?: ReadonlySet<string>;
}): Trade[] {
  const { liveTrades, fallbackTrades, acceptedCloudAtMs, seenTradeIds } = args;
  const map = new Map<string, Trade>();
  for (const trade of liveTrades) map.set(trade.id, trade);
  const cloudHasRecords = liveTrades.length > 0;
  for (const trade of fallbackTrades) {
    if (map.has(trade.id)) continue;
    if (
      !shouldKeepLocalOnlyRecord({
        cloudHasRecords,
        acceptedCloudAtMs,
        createdAtMs: idCreatedAtMs(trade.id),
        previouslySeen: seenTradeIds?.has(trade.id) === true,
      })
    ) {
      continue;
    }
    map.set(trade.id, trade);
  }
  return withoutRedundantHiddenTrades([...map.values()]).sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

export function reconcileTodosFromSources(args: {
  liveTodos: TradePlanTodo[];
  fallbackTodos: TradePlanTodo[];
  acceptedCloudAtMs: number | null;
  seenTodoIds?: ReadonlySet<string>;
}): TradePlanTodo[] {
  const { liveTodos, fallbackTodos, acceptedCloudAtMs, seenTodoIds } = args;
  const map = new Map<string, TradePlanTodo>();
  for (const todo of liveTodos) map.set(todo.id, todo);
  const cloudHasRecords = liveTodos.length > 0;
  for (const todo of fallbackTodos) {
    if (map.has(todo.id)) continue;
    const parsed = Date.parse(todo.createdAt);
    if (
      !shouldKeepLocalOnlyRecord({
        cloudHasRecords,
        acceptedCloudAtMs,
        createdAtMs: Number.isFinite(parsed) ? parsed : idCreatedAtMs(todo.id),
        previouslySeen: seenTodoIds?.has(todo.id) === true,
      })
    ) {
      continue;
    }
    map.set(todo.id, todo);
  }
  return [...map.values()].sort((a, b) => {
    const d = a.createdAt.localeCompare(b.createdAt);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * 같은 계정의 다른 기기와 맞출 때 쓰는 동기화 계획.
 * 클라우드에만 있는 기록은 지우지 않는다. 이 기기 목록에서 빠진 id만 삭제로 본다.
 * 클라우드에서 본 적 있는 id가 지금 클라우드에 없으면 다른 기기 삭제라서 로컬에서 뺀다.
 */
export function planCloudRecordSync<T extends { id: string }>(args: {
  localRecords: readonly T[];
  remoteFingerprints: Record<string, string>;
  remoteRecords: Record<string, T>;
  seenIds: ReadonlySet<string>;
  previousLocalIds: ReadonlySet<string> | null;
  fingerprintOf: (record: T) => string;
  normalize?: (records: readonly T[]) => T[];
}): { replaceLocal: T[] | null; upserts: T[]; deletes: T[] } {
  const normalized = args.normalize ? args.normalize(args.localRecords) : [...args.localRecords];
  if (normalized.length !== args.localRecords.length) {
    return { replaceLocal: normalized, upserts: [], deletes: [] };
  }
  const removedOnAnotherDevice = normalized.filter(
    (record) => args.remoteFingerprints[record.id] === undefined && args.seenIds.has(record.id),
  );
  if (removedOnAnotherDevice.length > 0) {
    const drop = new Set(removedOnAnotherDevice.map((record) => record.id));
    return {
      replaceLocal: normalized.filter((record) => !drop.has(record.id)),
      upserts: [],
      deletes: [],
    };
  }
  const currentIds = new Set(normalized.map((record) => record.id));
  const deletes = args.previousLocalIds
    ? [...args.previousLocalIds]
        .filter((id) => !currentIds.has(id))
        .map((id) => args.remoteRecords[id])
        .filter((record): record is T => Boolean(record))
    : [];
  const upserts = normalized.filter((record) => {
    const remoteFingerprint = args.remoteFingerprints[record.id];
    if (remoteFingerprint === undefined) return !args.seenIds.has(record.id);
    return remoteFingerprint !== args.fingerprintOf(record);
  });
  return { replaceLocal: null, upserts, deletes };
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

/** 라이브 trades/todos가 비어 있을 때만 레거시 백업으로 복구한다. 삭제 이력이 있으면 빈 상태를 유지한다. */
export function shouldHydrateFromLegacy(input: {
  liveTradeCount: number;
  liveTodoCount: number;
  hasDeleteHistory: boolean;
  legacyHasItems: boolean;
}): boolean {
  if (input.liveTradeCount > 0 || input.liveTodoCount > 0) return false;
  if (input.hasDeleteHistory) return false;
  return input.legacyHasItems;
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

/**
 * 자동 백업을 남길지 판단하는 값.
 * 시세·전일가·갱신 시각은 장중에도 계속 바뀌므로 빼서, 계정이 늘어도
 * 거래 전체가 든 스냅샷이 시세마다 쌓이지 않게 한다.
 */
export function portfolioGuardFingerprint(input: PersistedPortfolioV1): string {
  return JSON.stringify({
    trades: buildTradeFingerprintMap(input.trades),
    todos: buildTodoFingerprintMap(input.todos),
    notes: input.notes,
    krSellCommissionRate: normalizeKrSellCommissionRate(input.krSellCommissionRate),
    krPreferExtendedQuote: input.krPreferExtendedQuote === true,
  });
}

async function loadBootstrap(args: {
  uid: string;
  localPortfolio: PersistedPortfolioV1;
  localPersistedAtMs: number;
  acceptedCloudAtMs: number | null;
  seenTradeIds?: ReadonlySet<string>;
  seenTodoIds?: ReadonlySet<string>;
}): Promise<CloudBootstrapResult> {
  const { uid, localPortfolio, localPersistedAtMs, acceptedCloudAtMs } = args;
  const [live, remoteMeta] = await Promise.all([
    fetchCloudLivePortfolio(uid),
    fetchCloudPortfolioMeta(uid),
  ]);
  const liveEmpty = live.trades.length === 0 && live.todos.length === 0;
  const [legacySnapshot, deletedTrades, deletedTodos] = liveEmpty
    ? await Promise.all([
        fetchCloudPortfolio(uid),
        listCloudDeletedTrades(uid, 1).catch(() => []),
        listCloudDeletedTodos(uid, 1).catch(() => []),
      ])
    : [null, [], []];
  const normalizedLegacy = legacySnapshot
    ? normalizeLoadedPortfolio(legacySnapshot.portfolio)
    : null;
  const shouldUseLegacyMigration = shouldHydrateFromLegacy({
    liveTradeCount: live.trades.length,
    liveTodoCount: live.todos.length,
    hasDeleteHistory: deletedTrades.length > 0 || deletedTodos.length > 0,
    legacyHasItems:
      (normalizedLegacy?.trades.length ?? 0) > 0 ||
      (normalizedLegacy?.todos.length ?? 0) > 0,
  });

  const maxRemoteMetaUpdatedAtMs = remoteMeta?.updatedAtMs ?? 0;
  const localHasPortfolio =
    localPortfolio.trades.length > 0 || localPortfolio.todos.length > 0;
  const preferLocalMeta =
    localHasPortfolio && localPersistedAtMs > maxRemoteMetaUpdatedAtMs;

  let snapshotPortfolio: PersistedPortfolioV1 | null = null;
  if (
    liveEmpty &&
    !localHasPortfolio &&
    !shouldUseLegacyMigration &&
    deletedTrades.length === 0 &&
    deletedTodos.length === 0
  ) {
    try {
      const snaps = await listCloudPortfolioSnapshots(uid, 1);
      const first = snaps[0];
      if (first) {
        const raw = await fetchCloudPortfolioSnapshot(uid, first.id);
        snapshotPortfolio = raw ? normalizeLoadedPortfolio(raw) : null;
      }
    } catch {
      snapshotPortfolio = null;
    }
  }
  const hydratePortfolio =
    shouldUseLegacyMigration && normalizedLegacy
      ? normalizedLegacy
      : snapshotPortfolio &&
          (snapshotPortfolio.trades.length > 0 || snapshotPortfolio.todos.length > 0)
        ? snapshotPortfolio
        : null;

  const fallbackTrades = localHasPortfolio
    ? localPortfolio.trades
    : (hydratePortfolio?.trades ?? localPortfolio.trades);
  const fallbackTodos = localHasPortfolio
    ? localPortfolio.todos
    : (hydratePortfolio?.todos ?? localPortfolio.todos);

  const nextTrades = reconcileTradesFromSources({
    liveTrades: live.trades,
    fallbackTrades,
    acceptedCloudAtMs,
    seenTradeIds: args.seenTradeIds,
  });
  const nextTodos = reconcileTodosFromSources({
    liveTodos: live.todos,
    fallbackTodos,
    acceptedCloudAtMs,
    seenTodoIds: args.seenTodoIds,
  });

  const nextMeta: CloudPortfolioMetaInput = {
    quotes: pickMetaValue({
      remote: remoteMeta?.quotes,
      legacy: hydratePortfolio?.quotes,
      local: localPortfolio.quotes,
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
    }),
    positionIds: pickMetaValue({
      remote: remoteMeta?.positionIds,
      legacy: hydratePortfolio?.positionIds,
      local: localPortfolio.positionIds,
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
    }),
    notes: pickMetaValue({
      remote: remoteMeta?.notes,
      legacy: hydratePortfolio?.notes,
      local: localPortfolio.notes,
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
    }),
    quoteUpdatedAt: pickMetaValue({
      remote: remoteMeta?.quoteUpdatedAt,
      legacy: hydratePortfolio?.quoteUpdatedAt,
      local: localPortfolio.quoteUpdatedAt,
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
    }),
    lastKrQuoteBulkAt: pickMetaValue({
      remote: remoteMeta?.lastKrQuoteBulkAt,
      legacy: hydratePortfolio?.lastKrQuoteBulkAt,
      local: localPortfolio.lastKrQuoteBulkAt,
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
    }),
    krSellCommissionRate: normalizeKrSellCommissionRate(
      pickMetaValue({
        remote: remoteMeta?.krSellCommissionRate,
        legacy: hydratePortfolio?.krSellCommissionRate,
        local: localPortfolio.krSellCommissionRate,
        ignoreLegacy: !hydratePortfolio || preferLocalMeta,
      }),
    ),
    krPreferExtendedQuote: pickMetaValue({
      remote: remoteMeta?.krPreferExtendedQuote,
      legacy: hydratePortfolio?.krPreferExtendedQuote,
      local: localPortfolio.krPreferExtendedQuote === true,
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
    }),
    krDayOpenByTicker: pickMetaValue({
      remote: remoteMeta?.krDayOpenByTicker,
      legacy: hydratePortfolio?.krDayOpenByTicker,
      local: localPortfolio.krDayOpenByTicker ?? {},
      ignoreLegacy: !hydratePortfolio || preferLocalMeta,
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
    shouldApplyPortfolio: hydratePortfolio !== null,
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
