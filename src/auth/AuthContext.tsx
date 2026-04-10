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
  onAuthStateChanged,
  signInWithPopup,
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
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
  }, [firebaseConfigured]);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseConfigured) return;
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
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
