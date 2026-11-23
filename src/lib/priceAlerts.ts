import type { WatchItem } from '../types/watchItem';

export type AlertLevel = 'reached' | 'near' | 'waiting' | 'off';
export type AlertSource = 'watch' | 'todo';

/** 알림 목록에서 할 일 도달은 [보유], 관심종목 도달은 [관심]으로 종목명 앞에 붙인다. */
export function alertItemTitle(source: AlertSource, name: string): string {
  const tag = source === 'watch' ? '[관심]' : '[보유]';
  const bare = name
    .replace(/^\[(관심|보유)\]\s*/, '')
    .replace(/^(관심 도달:|To-do 도달:|To-do 근접:)\s*/, '')
    .trim();
  return `${tag} ${bare || name.trim()}`;
}

export interface StoredAlertEvent {
  id: string;
  source: AlertSource;
  sourceId: string;
  title: string;
  body: string;
  status: 'reached' | 'near';
  at: string;
  read: boolean;
}

const INBOX_KEY = 'traderos-alert-inbox-v1';
const INBOX_LIMIT = 40;

export function watchAlertLevel(item: WatchItem, quote: number | undefined): AlertLevel {
  if (!item.alert?.enabled) return 'off';
  if (quote === undefined || !Number.isFinite(quote)) return 'waiting';
  const hit =
    item.alert.direction === 'above' ? quote >= item.alert.price : quote <= item.alert.price;
  return hit ? 'reached' : 'waiting';
}

/** 대기에서 도달, 또는 대기에서 근접으로 바뀐 순간에만 알림 대상을 고른다. */
export function crossingAlert(
  prev: AlertLevel | undefined,
  next: AlertLevel,
  nearEnabled: boolean,
): 'reached' | 'near' | null {
  if (!prev || next === prev || next === 'off') return null;
  if (next === 'reached' && prev !== 'reached') return 'reached';
  if (nearEnabled && next === 'near' && prev === 'waiting') return 'near';
  return null;
}

export function pushAlertEvent(
  items: readonly StoredAlertEvent[],
  event: Omit<StoredAlertEvent, 'id' | 'read'>,
): StoredAlertEvent[] {
  const next: StoredAlertEvent = {
    ...event,
    id: `${event.source}-${event.sourceId}-${event.status}-${event.at}`,
    read: false,
  };
  return [next, ...items.filter((item) => item.id !== next.id)].slice(0, INBOX_LIMIT);
}

export function markAlertEventsRead(items: readonly StoredAlertEvent[]): StoredAlertEvent[] {
  if (items.every((item) => item.read)) return [...items];
  return items.map((item) => (item.read ? item : { ...item, read: true }));
}

function isStoredAlertEvent(input: unknown): input is StoredAlertEvent {
  if (!input || typeof input !== 'object') return false;
  const raw = input as Partial<StoredAlertEvent>;
  return (
    typeof raw.id === 'string' &&
    (raw.source === 'watch' || raw.source === 'todo') &&
    typeof raw.sourceId === 'string' &&
    typeof raw.title === 'string' &&
    typeof raw.body === 'string' &&
    (raw.status === 'reached' || raw.status === 'near') &&
    typeof raw.at === 'string' &&
    typeof raw.read === 'boolean'
  );
}

export function loadAlertInbox(): StoredAlertEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(INBOX_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredAlertEvent).slice(0, INBOX_LIMIT);
  } catch {
    return [];
  }
}

export function saveAlertInbox(items: readonly StoredAlertEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INBOX_KEY, JSON.stringify(items.slice(0, INBOX_LIMIT)));
  } catch {
    /* 저장 공간이 없으면 목록만 메모리에 둔다 */
  }
}
