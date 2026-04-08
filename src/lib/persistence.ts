import type { Trade } from '../types/trade';

const STORAGE_KEY = 'traderos-portfolio-v1';

export interface PersistedPortfolioV1 {
  trades: Trade[];
  quotes: Record<string, number>;
  positionIds: Record<string, string>;
}

export function loadPersisted(): PersistedPortfolioV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPortfolioV1;
    if (!data || !Array.isArray(data.trades)) return null;
    if (typeof data.quotes !== 'object' || data.quotes === null) return null;
    if (typeof data.positionIds !== 'object' || data.positionIds === null) {
      data.positionIds = {};
    }
    return data;
  } catch {
    return null;
  }
}

export function savePersisted(data: PersistedPortfolioV1): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
