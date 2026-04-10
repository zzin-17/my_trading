import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import type { PersistedPortfolioV1 } from './persistence';
import { coercePersistedPortfolio } from './persistence';
import { getFirebaseDb } from './firebase/client';

function portfolioDocRef(uid: string) {
  return doc(getFirebaseDb(), 'users', uid, 'traderos', 'v1');
}

export interface CloudPortfolioSnapshot {
  portfolio: PersistedPortfolioV1;
  /** 밀리초 (표시용) */
  updatedAtMs: number;
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
