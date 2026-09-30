import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase/client';

type AuthContextValue = {
  firebaseConfigured: boolean;
  user: User | null;
  authReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const firebaseConfigured = isFirebaseConfigured();

  useEffect(() => {
    if (!firebaseConfigured) {
      setUser(null);
      setAuthReady(true);
      return;
    }
    const auth = getFirebaseAuth();
    void getRedirectResult(auth).catch(() => {
      /* 팝업 로그인만 쓴 경우 무시 */
    });
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, [firebaseConfigured]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseConfigured) return;
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e
          ? String((e as { code: unknown }).code)
          : '';
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const mobile = /iPhone|iPad|iPod|Android/i.test(ua);
      const popupBlocked = code.includes('popup-blocked');
      const cancelledPopup = code.includes('cancelled-popup-request');
      if (mobile || popupBlocked || cancelledPopup) {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw e;
    }
  }, [firebaseConfigured]);

  const signOutUser = useCallback(async () => {
    if (!firebaseConfigured) return;
    await signOut(getFirebaseAuth());
  }, [firebaseConfigured]);

  const value = useMemo(
    () => ({
      firebaseConfigured,
      user,
      authReady,
      signInWithGoogle,
      signOutUser,
    }),
    [
      firebaseConfigured,
      user,
      authReady,
      signInWithGoogle,
      signOutUser,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용하세요.');
  }
  return ctx;
}
