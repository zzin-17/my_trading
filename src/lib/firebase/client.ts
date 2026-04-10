import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;

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
