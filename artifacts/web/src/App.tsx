import { useState, useCallback, useEffect } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { storage } from "@/lib/storage";
import SplashScreen from "@/pages/SplashScreen";
import LoginPage from "@/pages/LoginPage";
import MainApp from "@/pages/MainApp";

type AppState = "splash" | "login" | "app";

export default function App() {
  const [appState, setAppState] = useState<AppState>("splash");
  const [userName, setUserName] = useState<string>("");

  const handleSplashDone = useCallback(() => {
    const savedName = storage.getSession();
    if (savedName) {
      setUserName(savedName);
      setAppState("app");
    } else {
      setAppState("login");
    }
  }, []);

  const handleLogin = useCallback((name: string) => {
    setUserName(name);
    setAppState("app");
  }, []);

  const handleLogout = useCallback(() => {
    storage.clearSession();
    setUserName("");
    setAppState("login");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {appState === "splash" && <SplashScreen onDone={handleSplashDone} />}
      {appState === "login" && <LoginPage onLogin={handleLogin} />}
      {appState === "app" && <MainApp userName={userName} onLogout={handleLogout} />}
    </QueryClientProvider>
  );
}
