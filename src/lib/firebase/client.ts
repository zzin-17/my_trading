import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from 'firebase/app-check';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;

/** Vite는 import.meta.env 동적 접근([key])을 인라인하지 않을 수 있어 반드시 정적 프로퍼티로 읽음 */
function trimEnv(v: string | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    trimEnv(import.meta.env.VITE_FIREBASE_API_KEY) &&
      trimEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  );
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase env 미설정');
  }
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }
  app = initializeApp({
    apiKey: trimEnv(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: trimEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: trimEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    appId: trimEnv(import.meta.env.VITE_FIREBASE_APP_ID),
  });
  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

export function isFirebaseAppCheckConfigured(): boolean {
  return Boolean(trimEnv(import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY));
}

/**
 * App Check는 봇/비정상 클라이언트의 무분별한 Firebase 호출을 완화한다.
 * 사이트 키가 없는 환경에서는 조용히 비활성(no-op) 처리한다.
 */
export function initFirebaseAppCheck(): void {
  if (appCheck) return;
  if (!isFirebaseConfigured() || !isFirebaseAppCheckConfigured()) return;
  if (typeof window === 'undefined') return;
  const siteKey = trimEnv(import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY);
  if (!siteKey) return;
  appCheck = initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
