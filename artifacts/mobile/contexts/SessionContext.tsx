import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type SessionContextValue = {
  name: string | null;
  ready: boolean;
  signIn: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const storageKey = "seif-music-session-name";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((value) => setName(value))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      name,
      ready,
      signIn: async (nextName: string) => {
        await AsyncStorage.setItem(storageKey, nextName);
        setName(nextName);
      },
      signOut: async () => {
        await AsyncStorage.removeItem(storageKey);
        setName(null);
      },
    }),
    [name, ready],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionProvider");
  }
  return value;
}
