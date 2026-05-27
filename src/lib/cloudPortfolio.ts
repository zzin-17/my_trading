import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import type { PersistedPortfolioV1 } from './persistence';
import { coercePersistedPortfolio, sanitizeKrDayOpenByTicker } from './persistence';
import { getFirebaseDb } from './firebase/client';
import type { Trade } from '../types/trade';
import type { TradePlanTodo } from '../types/todo';
import type { CurrencyCode, Market } from '../types/portfolio';
import { normalizeKrSellCommissionRate } from './krTradingAssumptions';

function portfolioDocRef(uid: string) {
  return doc(getFirebaseDb(), 'users', uid, 'traderos', 'v1');
}

function tradeCollectionRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'trades');
}

function tradeDocRef(uid: string, tradeId: string) {
  return doc(getFirebaseDb(), 'users', uid, 'trades', tradeId);
}

function todoCollectionRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'todos');
}

function todoDocRef(uid: string, todoId: string) {
  return doc(getFirebaseDb(), 'users', uid, 'todos', todoId);
}

function metaDocRef(uid: string) {
  return doc(getFirebaseDb(), 'users', uid, 'traderos_meta', 'v1');
}

function snapshotCollectionRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'portfolio_snapshots');
}

function snapshotDocRef(uid: string, snapshotId: string) {
  return doc(getFirebaseDb(), 'users', uid, 'portfolio_snapshots', snapshotId);
}

function tradeTrashCollectionRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'trade_trash');
}

function todoTrashCollectionRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'todo_trash');
}

function eventCollectionRef(uid: string) {
  return collection(getFirebaseDb(), 'users', uid, 'portfolio_events');
}

export interface CloudPortfolioSnapshot {
  portfolio: PersistedPortfolioV1;
  /** 밀리초 (표시용) */
  updatedAtMs: number;
}

export interface CloudLivePortfolio {
  trades: Trade[];
  todos: TradePlanTodo[];
  tradeUpdatedAtMsById: Record<string, number>;
  todoUpdatedAtMsById: Record<string, number>;
}

export interface CloudPortfolioMeta {
  quotes: Record<string, number>;
  positionIds: Record<string, string>;
  notes: Record<string, string>;
  quoteUpdatedAt: Record<string, string>;
  lastKrQuoteBulkAt: string | null;
  krSellCommissionRate: number;
  krPreferExtendedQuote: boolean;
  krDayOpenByTicker: Record<string, number>;
  updatedAtMs: number;
}

export interface CloudPortfolioSnapshotSummary {
  id: string;
  createdAtMs: number;
  reason: string | null;
  sourceDeviceId: string | null;
  tradeCount: number;
  todoCount: number;
  latestTradeDate: string | null;
}

export interface CloudDeletedTradeRecord {
  trashId: string;
  itemId: string;
  deletedAtMs: number;
  reason: string | null;
  sourceDeviceId: string | null;
  trade: Trade;
}

export interface CloudDeletedTodoRecord {
  trashId: string;
  itemId: string;
  deletedAtMs: number;
  reason: string | null;
  sourceDeviceId: string | null;
  todo: TradePlanTodo;
}

type EventEntityType = 'trade' | 'todo' | 'meta' | 'snapshot';

interface EventLogInput {
  action: string;
  entityType: EventEntityType;
  entityId: string;
  sourceDeviceId?: string | null;
  summary?: string | null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function isMarket(input: unknown): input is Market {
  return input === 'KR' || input === 'US';
}

function isCurrencyCode(input: unknown): input is CurrencyCode {
  return input === 'KRW' || input === 'USD';
}

function parseCloudTrade(input: unknown, fallbackId: string): Trade | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id : fallbackId;
  if (typeof input.date !== 'string' || !input.date.trim()) return null;
  if (typeof input.ticker !== 'string' || !input.ticker.trim()) return null;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  if (typeof input.sector !== 'string' || !input.sector.trim()) return null;
  if (!isMarket(input.market)) return null;
  if (input.side !== 'buy' && input.side !== 'sell') return null;
  if (
    typeof input.quantity !== 'number' ||
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0
  ) {
    return null;
  }
  if (
    typeof input.price !== 'number' ||
    !Number.isFinite(input.price) ||
    input.price < 0
  ) {
    return null;
  }
  if (!isCurrencyCode(input.currency)) return null;
  if (input.note !== undefined && typeof input.note !== 'string') return null;
  if (
    input.excludeFromJournal !== undefined &&
    typeof input.excludeFromJournal !== 'boolean'
  ) {
    return null;
  }
  if (
    input.executionStatus !== undefined &&
    input.executionStatus !== 'pending' &&
    input.executionStatus !== 'filled'
  ) {
    return null;
  }
  return {
    id,
    date: input.date.trim(),
    ticker: input.ticker.trim(),
    name: input.name.trim(),
    sector: input.sector.trim(),
    market: input.market,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    currency: input.currency,
    ...(typeof input.note === 'string' && input.note.trim()
      ? { note: input.note.trim() }
      : {}),
    ...(input.excludeFromJournal === true ? { excludeFromJournal: true as const } : {}),
    ...(input.executionStatus ? { executionStatus: input.executionStatus } : {}),
  };
}

function parseCloudTodo(input: unknown, fallbackId: string): TradePlanTodo | null {
  if (!isRecord(input)) return null;
  const id = typeof input.id === 'string' && input.id.trim() ? input.id : fallbackId;
  if (!isMarket(input.market)) return null;
  if (typeof input.ticker !== 'string' || !input.ticker.trim()) return null;
  if (input.name !== undefined && typeof input.name !== 'string') return null;
  if (input.action !== 'buy' && input.action !== 'sell') return null;
  if (
    typeof input.targetPrice !== 'number' ||
    !Number.isFinite(input.targetPrice) ||
    input.targetPrice < 0
  ) {
    return null;
  }
  if (
    typeof input.quantity !== 'number' ||
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0
  ) {
    return null;
  }
  if (input.note !== undefined && typeof input.note !== 'string') return null;
  if (typeof input.done !== 'boolean') return null;
  if (typeof input.createdAt !== 'string' || !input.createdAt.trim()) return null;
  return {
    id,
    market: input.market,
    ticker: input.ticker.trim(),
    ...(typeof input.name === 'string' && input.name.trim()
      ? { name: input.name.trim() }
      : {}),
    action: input.action,
    targetPrice: input.targetPrice,
    quantity: input.quantity,
    ...(typeof input.note === 'string' && input.note.trim()
      ? { note: input.note.trim() }
      : {}),
    done: input.done,
    createdAt: input.createdAt.trim(),
  };
}

function sortTradesForCloud(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function sortTodosForCloud(todos: TradePlanTodo[]): TradePlanTodo[] {
  return [...todos].sort((a, b) => {
    const d = a.createdAt.localeCompare(b.createdAt);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function updatedAtToMillis(input: unknown): number {
  return input instanceof Timestamp ? input.toMillis() : 0;
}

function createDocId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializePortfolioBody(portfolio: PersistedPortfolioV1): string {
  return JSON.stringify(portfolio);
}

function parsePortfolioBody(body: unknown): PersistedPortfolioV1 | null {
  if (typeof body !== 'string' || !body.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  return coercePersistedPortfolio(parsed);
}

function summarizePortfolio(portfolio: PersistedPortfolioV1): {
  tradeCount: number;
  todoCount: number;
  latestTradeDate: string | null;
} {
  const trades = portfolio.trades.filter((trade) => trade.date !== '1900-01-01');
  const latestTradeDate = trades.reduce<string | null>(
    (latest, trade) => (!latest || trade.date > latest ? trade.date : latest),
    null,
  );
  return {
    tradeCount: trades.length,
    todoCount: portfolio.todos.length,
    latestTradeDate,
  };
}

function buildEventSummary(input: EventLogInput): string {
  return input.summary?.trim() || `${input.entityType}:${input.action}:${input.entityId}`;
}

function parseSnapshotSummary(input: Record<string, unknown>, snapshotId: string): CloudPortfolioSnapshotSummary {
  return {
    id: snapshotId,
    createdAtMs: updatedAtToMillis(input.createdAt),
    reason: typeof input.reason === 'string' ? input.reason : null,
    sourceDeviceId:
      typeof input.sourceDeviceId === 'string' ? input.sourceDeviceId : null,
    tradeCount:
      typeof input.tradeCount === 'number' && Number.isFinite(input.tradeCount)
        ? input.tradeCount
        : 0,
    todoCount:
      typeof input.todoCount === 'number' && Number.isFinite(input.todoCount)
        ? input.todoCount
        : 0,
    latestTradeDate:
      typeof input.latestTradeDate === 'string' ? input.latestTradeDate : null,
  };
}

function buildSingleTradeBody(trade: Trade): string {
  return JSON.stringify(trade);
}

function parseSingleTradeBody(body: unknown): Trade | null {
  if (typeof body !== 'string' || !body.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  return parseCloudTrade(parsed, '');
}

function buildSingleTodoBody(todo: TradePlanTodo): string {
  return JSON.stringify(todo);
}

function parseSingleTodoBody(body: unknown): TradePlanTodo | null {
  if (typeof body !== 'string' || !body.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  return parseCloudTodo(parsed, '');
}

function parseTradeTrashRecord(input: unknown, trashId: string): CloudDeletedTradeRecord | null {
  if (!isRecord(input)) return null;
  const trade = parseSingleTradeBody(input.body);
  if (!trade) return null;
  return {
    trashId,
    itemId: typeof input.itemId === 'string' ? input.itemId : trade.id,
    deletedAtMs: updatedAtToMillis(input.deletedAt),
    reason: typeof input.reason === 'string' ? input.reason : null,
    sourceDeviceId:
      typeof input.sourceDeviceId === 'string' ? input.sourceDeviceId : null,
    trade,
  };
}

function parseTodoTrashRecord(input: unknown, trashId: string): CloudDeletedTodoRecord | null {
  if (!isRecord(input)) return null;
  const todo = parseSingleTodoBody(input.body);
  if (!todo) return null;
  return {
    trashId,
    itemId: typeof input.itemId === 'string' ? input.itemId : todo.id,
    deletedAtMs: updatedAtToMillis(input.deletedAt),
    reason: typeof input.reason === 'string' ? input.reason : null,
    sourceDeviceId:
      typeof input.sourceDeviceId === 'string' ? input.sourceDeviceId : null,
    todo,
  };
}

function isStringRecord(input: unknown): input is Record<string, string> {
  if (!isRecord(input)) return false;
  return Object.values(input).every((x) => typeof x === 'string');
}

function isNumberRecord(input: unknown): input is Record<string, number> {
  if (!isRecord(input)) return false;
  return Object.values(input).every((x) => typeof x === 'number' && Number.isFinite(x));
}

function coerceCloudPortfolioMeta(input: unknown, updatedAtMs: number): CloudPortfolioMeta | null {
  if (!isRecord(input)) return null;
  if (!isNumberRecord(input.quotes)) return null;
  if (!isStringRecord(input.positionIds)) return null;
  if (!isStringRecord(input.notes ?? {})) return null;
  if (!isStringRecord(input.quoteUpdatedAt ?? {})) return null;
  return {
    quotes: input.quotes,
    positionIds: input.positionIds,
    notes: isStringRecord(input.notes) ? input.notes : {},
    quoteUpdatedAt: isStringRecord(input.quoteUpdatedAt) ? input.quoteUpdatedAt : {},
    lastKrQuoteBulkAt:
      typeof input.lastKrQuoteBulkAt === 'string' ? input.lastKrQuoteBulkAt : null,
    krSellCommissionRate: normalizeKrSellCommissionRate(input.krSellCommissionRate),
    krPreferExtendedQuote: input.krPreferExtendedQuote === true,
    krDayOpenByTicker: sanitizeKrDayOpenByTicker(input.krDayOpenByTicker),
    updatedAtMs,
  };
}

export async function fetchCloudPortfolio(
  uid: string,
): Promise<CloudPortfolioSnapshot | null> {
  const snap = await getDoc(portfolioDocRef(uid));
  if (!snap.exists()) return null;
  const d = snap.data();
  const body = typeof d.body === 'string' ? d.body : null;
  if (!body) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return null;
  }
  const portfolio = coercePersistedPortfolio(parsed);
  if (!portfolio) return null;
  const ts = d.updatedAt;
  const updatedAtMs =
    ts instanceof Timestamp ? ts.toMillis() : Date.now();
  return { portfolio, updatedAtMs };
}

export async function pushCloudPortfolio(
  uid: string,
  portfolio: PersistedPortfolioV1,
): Promise<void> {
  const body = serializePortfolioBody(portfolio);
  await setDoc(portfolioDocRef(uid), {
    body,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchCloudPortfolioMeta(
  uid: string,
): Promise<CloudPortfolioMeta | null> {
  const snap = await getDoc(metaDocRef(uid));
  if (!snap.exists()) return null;
  const updatedAtMs = updatedAtToMillis(snap.data().updatedAt);
  return coerceCloudPortfolioMeta(snap.data(), updatedAtMs);
}

export async function fetchCloudLivePortfolio(
  uid: string,
): Promise<CloudLivePortfolio> {
  const [tradeSnap, todoSnap] = await Promise.all([
    getDocs(tradeCollectionRef(uid)),
    getDocs(todoCollectionRef(uid)),
  ]);
  const tradeUpdatedAtMsById: Record<string, number> = {};
  const todoUpdatedAtMsById: Record<string, number> = {};
  const trades = tradeSnap.docs
    .map((x) => {
      const parsed = parseCloudTrade(x.data(), x.id);
      if (parsed) tradeUpdatedAtMsById[parsed.id] = updatedAtToMillis(x.data().updatedAt);
      return parsed;
    })
    .filter((x): x is Trade => x !== null);
  const todos = todoSnap.docs
    .map((x) => {
      const parsed = parseCloudTodo(x.data(), x.id);
      if (parsed) todoUpdatedAtMsById[parsed.id] = updatedAtToMillis(x.data().updatedAt);
      return parsed;
    })
    .filter((x): x is TradePlanTodo => x !== null);
  return {
    trades: sortTradesForCloud(trades),
    todos: sortTodosForCloud(todos),
    tradeUpdatedAtMsById,
    todoUpdatedAtMsById,
  };
}

export async function createCloudPortfolioSnapshot(
  uid: string,
  portfolio: PersistedPortfolioV1,
  reason: string,
  sourceDeviceId?: string | null,
): Promise<string> {
  const snapshotId = createDocId('snapshot');
  const summary = summarizePortfolio(portfolio);
  await setDoc(snapshotDocRef(uid, snapshotId), {
    body: serializePortfolioBody(portfolio),
    reason,
    sourceDeviceId: sourceDeviceId ?? null,
    ...summary,
    createdAt: serverTimestamp(),
  });
  await appendCloudEvent(uid, {
    action: 'snapshot.created',
    entityType: 'snapshot',
    entityId: snapshotId,
    sourceDeviceId,
    summary: `${reason} · 거래 ${summary.tradeCount}건`,
  });
  return snapshotId;
}

export async function listCloudPortfolioSnapshots(
  uid: string,
  maxItems = 12,
): Promise<CloudPortfolioSnapshotSummary[]> {
  const snap = await getDocs(
    query(snapshotCollectionRef(uid), orderBy('createdAt', 'desc'), limit(maxItems)),
  );
  return snap.docs
    .map((x) => parseSnapshotSummary(x.data(), x.id))
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function fetchCloudPortfolioSnapshot(
  uid: string,
  snapshotId: string,
): Promise<PersistedPortfolioV1 | null> {
  const snap = await getDoc(snapshotDocRef(uid, snapshotId));
  if (!snap.exists()) return null;
  return parsePortfolioBody(snap.data().body);
}

async function appendCloudEvent(uid: string, input: EventLogInput): Promise<void> {
  const ref = doc(eventCollectionRef(uid), createDocId('event'));
  await setDoc(ref, {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceDeviceId: input.sourceDeviceId ?? null,
    summary: buildEventSummary(input),
    createdAt: serverTimestamp(),
  });
}

export async function listCloudDeletedTrades(
  uid: string,
  maxItems = 20,
): Promise<CloudDeletedTradeRecord[]> {
  const snap = await getDocs(
    query(tradeTrashCollectionRef(uid), orderBy('deletedAt', 'desc'), limit(maxItems)),
  );
  return snap.docs
    .map((x) => parseTradeTrashRecord(x.data(), x.id))
    .filter((x): x is CloudDeletedTradeRecord => x !== null)
    .sort((a, b) => b.deletedAtMs - a.deletedAtMs);
}

export async function listCloudDeletedTodos(
  uid: string,
  maxItems = 20,
): Promise<CloudDeletedTodoRecord[]> {
  const snap = await getDocs(
    query(todoTrashCollectionRef(uid), orderBy('deletedAt', 'desc'), limit(maxItems)),
  );
  return snap.docs
    .map((x) => parseTodoTrashRecord(x.data(), x.id))
    .filter((x): x is CloudDeletedTodoRecord => x !== null)
    .sort((a, b) => b.deletedAtMs - a.deletedAtMs);
}

export async function restoreCloudDeletedTrade(
  uid: string,
  trashId: string,
  sourceDeviceId?: string | null,
): Promise<Trade | null> {
  const snap = await getDoc(doc(tradeTrashCollectionRef(uid), trashId));
  if (!snap.exists()) return null;
  const record = parseTradeTrashRecord(snap.data(), trashId);
  if (!record) return null;
  const batch = writeBatch(getFirebaseDb());
  batch.set(tradeDocRef(uid, record.trade.id), {
    ...record.trade,
    updatedAt: serverTimestamp(),
  });
  batch.delete(doc(tradeTrashCollectionRef(uid), trashId));
  await batch.commit();
  await appendCloudEvent(uid, {
    action: 'trade.restored',
    entityType: 'trade',
    entityId: record.trade.id,
    sourceDeviceId,
    summary: `${record.trade.date} ${record.trade.ticker} ${record.trade.name} 복구`,
  });
  return record.trade;
}

export async function restoreCloudDeletedTodo(
  uid: string,
  trashId: string,
  sourceDeviceId?: string | null,
): Promise<TradePlanTodo | null> {
  const snap = await getDoc(doc(todoTrashCollectionRef(uid), trashId));
  if (!snap.exists()) return null;
  const record = parseTodoTrashRecord(snap.data(), trashId);
  if (!record) return null;
  const batch = writeBatch(getFirebaseDb());
  batch.set(todoDocRef(uid, record.todo.id), {
    ...record.todo,
    updatedAt: serverTimestamp(),
  });
  batch.delete(doc(todoTrashCollectionRef(uid), trashId));
  await batch.commit();
  await appendCloudEvent(uid, {
    action: 'todo.restored',
    entityType: 'todo',
    entityId: record.todo.id,
    sourceDeviceId,
    summary: `${record.todo.ticker} ${record.todo.action} 계획 복구`,
  });
  return record.todo;
}

export function subscribeCloudTrades(
  uid: string,
  onValue: (trades: Trade[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    tradeCollectionRef(uid),
    (snap) => {
      const trades = snap.docs
        .map((x) => parseCloudTrade(x.data(), x.id))
        .filter((x): x is Trade => x !== null);
      onValue(sortTradesForCloud(trades));
    },
    onError,
  );
}

export function subscribeCloudTodos(
  uid: string,
  onValue: (todos: TradePlanTodo[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    todoCollectionRef(uid),
    (snap) => {
      const todos = snap.docs
        .map((x) => parseCloudTodo(x.data(), x.id))
        .filter((x): x is TradePlanTodo => x !== null);
      onValue(sortTodosForCloud(todos));
    },
    onError,
  );
}

export function subscribeCloudPortfolioMeta(
  uid: string,
  onValue: (meta: CloudPortfolioMeta | null) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    metaDocRef(uid),
    (snap) => {
      if (!snap.exists()) {
        onValue(null);
        return;
      }
      const updatedAtMs = updatedAtToMillis(snap.data().updatedAt);
      onValue(coerceCloudPortfolioMeta(snap.data(), updatedAtMs));
    },
    onError,
  );
}

async function commitTradeChanges(
  uid: string,
  upserts: Trade[],
  deletes: Trade[],
  sourceDeviceId?: string | null,
): Promise<void> {
  const db = getFirebaseDb();
  const ops: Array<{ type: 'set'; value: Trade } | { type: 'trash'; value: Trade }> = [
    ...upserts.map((value) => ({ type: 'set' as const, value })),
    ...deletes.map((value) => ({ type: 'trash' as const, value })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'set') {
        batch.set(tradeDocRef(uid, op.value.id), {
          ...op.value,
          updatedAt: serverTimestamp(),
        });
      } else {
        const trashRef = doc(tradeTrashCollectionRef(uid), op.value.id);
        batch.set(trashRef, {
          itemId: op.value.id,
          ticker: op.value.ticker,
          name: op.value.name,
          date: op.value.date,
          body: buildSingleTradeBody(op.value),
          reason: 'user-delete',
          sourceDeviceId: sourceDeviceId ?? null,
          deletedAt: serverTimestamp(),
        });
        batch.delete(tradeDocRef(uid, op.value.id));
      }
    }
    await batch.commit();
  }
  await Promise.all(
    deletes.map((trade) =>
      appendCloudEvent(uid, {
        action: 'trade.softDeleted',
        entityType: 'trade',
        entityId: trade.id,
        sourceDeviceId,
        summary: `${trade.date} ${trade.ticker} ${trade.name} 삭제`,
      }),
    ),
  );
}

async function commitTodoChanges(
  uid: string,
  upserts: TradePlanTodo[],
  deletes: TradePlanTodo[],
  sourceDeviceId?: string | null,
): Promise<void> {
  const db = getFirebaseDb();
  const ops: Array<
    { type: 'set'; value: TradePlanTodo } | { type: 'trash'; value: TradePlanTodo }
  > = [
    ...upserts.map((value) => ({ type: 'set' as const, value })),
    ...deletes.map((value) => ({ type: 'trash' as const, value })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.type === 'set') {
        batch.set(todoDocRef(uid, op.value.id), {
          ...op.value,
          updatedAt: serverTimestamp(),
        });
      } else {
        const trashRef = doc(todoTrashCollectionRef(uid), op.value.id);
        batch.set(trashRef, {
          itemId: op.value.id,
          ticker: op.value.ticker,
          name: op.value.name ?? '',
          createdAtValue: op.value.createdAt,
          body: buildSingleTodoBody(op.value),
          reason: 'user-delete',
          sourceDeviceId: sourceDeviceId ?? null,
          deletedAt: serverTimestamp(),
        });
        batch.delete(todoDocRef(uid, op.value.id));
      }
    }
    await batch.commit();
  }
  await Promise.all(
    deletes.map((todo) =>
      appendCloudEvent(uid, {
        action: 'todo.softDeleted',
        entityType: 'todo',
        entityId: todo.id,
        sourceDeviceId,
        summary: `${todo.ticker} ${todo.action} 계획 삭제`,
      }),
    ),
  );
}

export async function syncCloudTrades(
  uid: string,
  upserts: Trade[],
  deletes: Trade[],
  sourceDeviceId?: string | null,
): Promise<void> {
  if (upserts.length === 0 && deletes.length === 0) return;
  await commitTradeChanges(uid, upserts, deletes, sourceDeviceId);
}

export async function syncCloudTodos(
  uid: string,
  upserts: TradePlanTodo[],
  deletes: TradePlanTodo[],
  sourceDeviceId?: string | null,
): Promise<void> {
  if (upserts.length === 0 && deletes.length === 0) return;
  await commitTodoChanges(uid, upserts, deletes, sourceDeviceId);
}

export async function syncCloudPortfolioMeta(
  uid: string,
  meta: Omit<CloudPortfolioMeta, 'updatedAtMs'>,
): Promise<void> {
  await setDoc(metaDocRef(uid), {
    ...meta,
    updatedAt: serverTimestamp(),
  });
}
