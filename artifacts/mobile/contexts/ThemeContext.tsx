import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  themeMode: ThemeMode;
  toggleTheme: () => void;
};

const THEME_KEY = "seif-theme-mode";
const ThemeCtx = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>(systemScheme === "dark" ? "dark" : "light");

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((value) => {
        if (value === "dark" || value === "light") {
          setThemeMode(value);
        }
      })
      .catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      AsyncStorage.setItem(THEME_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ themeMode, toggleTheme }), [themeMode, toggleTheme]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const systemScheme = useColorScheme();
  const fallback = systemScheme === "dark" ? "dark" : "light";
  return useContext(ThemeCtx) ?? { themeMode: fallback as ThemeMode, toggleTheme: () => undefined };
}