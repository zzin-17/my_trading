import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
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
  const body = JSON.stringify(portfolio);
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
  deletes: string[],
): Promise<void> {
  const db = getFirebaseDb();
  const ops: Array<{ type: 'set'; value: Trade } | { type: 'delete'; id: string }> = [
    ...upserts.map((value) => ({ type: 'set' as const, value })),
    ...deletes.map((id) => ({ type: 'delete' as const, id })),
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
        batch.delete(tradeDocRef(uid, op.id));
      }
    }
    await batch.commit();
  }
}

async function commitTodoChanges(
  uid: string,
  upserts: TradePlanTodo[],
  deletes: string[],
): Promise<void> {
  const db = getFirebaseDb();
  const ops: Array<
    { type: 'set'; value: TradePlanTodo } | { type: 'delete'; id: string }
  > = [
    ...upserts.map((value) => ({ type: 'set' as const, value })),
    ...deletes.map((id) => ({ type: 'delete' as const, id })),
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
        batch.delete(todoDocRef(uid, op.id));
      }
    }
    await batch.commit();
  }
}

export async function syncCloudTrades(
  uid: string,
  upserts: Trade[],
  deletes: string[],
): Promise<void> {
  if (upserts.length === 0 && deletes.length === 0) return;
  await commitTradeChanges(uid, upserts, deletes);
}

export async function syncCloudTodos(
  uid: string,
  upserts: TradePlanTodo[],
  deletes: string[],
): Promise<void> {
  if (upserts.length === 0 && deletes.length === 0) return;
  await commitTodoChanges(uid, upserts, deletes);
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
