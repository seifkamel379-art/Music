import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

export type ThemeMode = "dark" | "light";

export const DARK = {
  background: "#000000", foreground: "#FFFFFF",
  card: "#121212", cardForeground: "#FFFFFF",
  primary: "#1DB954", primaryForeground: "#000000",
  secondary: "#1F1F1F", secondaryForeground: "#FFFFFF",
  muted: "#181818", mutedForeground: "#B3B3B3",
  accent: "#1ED760", accentForeground: "#000000",
  destructive: "#F15E6C", destructiveForeground: "#FFFFFF",
  border: "#2A2A2A", input: "#242424",
  gold: "#1DB954", espresso: "#000000", sand: "#181818",
};

export const LIGHT = {
  background: "#FFFFFF", foreground: "#191414",
  card: "#F2F2F2", cardForeground: "#191414",
  primary: "#1DB954", primaryForeground: "#000000",
  secondary: "#E8E8E8", secondaryForeground: "#191414",
  muted: "#EFEFEF", mutedForeground: "#535353",
  accent: "#1ED760", accentForeground: "#000000",
  destructive: "#E22134", destructiveForeground: "#FFFFFF",
  border: "#D9DADC", input: "#FFFFFF",
  gold: "#1DB954", espresso: "#191414", sand: "#FFFFFF",
};

export type Colors = typeof DARK;

type ThemeCtx = {
  themeMode: ThemeMode;
  toggleTheme: () => void;
  colors: Colors;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem("sk_theme") as ThemeMode) || "dark"; } catch { return "dark"; }
  });

  const colors = themeMode === "dark" ? DARK : LIGHT;

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      root.style.setProperty(`--${cssKey}`, value);
    });
    root.style.setProperty("--background", colors.background);
    document.body.style.background = colors.background;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeMode === "dark" ? "#000000" : "#1DB954");
  }, [themeMode, colors]);

  const toggleTheme = () => {
    setThemeMode(prev => {
      const next = prev === "dark" ? "light" : "dark";
      try { localStorage.setItem("sk_theme", next); } catch {}
      return next;
    });
  };

  const value = useMemo<ThemeCtx>(() => ({ themeMode, toggleTheme, colors }), [themeMode, colors]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme must be inside ThemeProvider");
  return v;
}
