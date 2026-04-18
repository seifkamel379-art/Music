import { useState } from "react";
import { useMusicLogin } from "@workspace/api-client-react";
import { storage } from "@/lib/storage";

interface Props { onLogin: (name: string) => void; }

const C = {
  background: "#000000", card: "#121212", primary: "#1DB954", primaryFg: "#000000",
  foreground: "#FFFFFF", mutedFg: "#B3B3B3", border: "#2A2A2A",
  destructive: "#F15E6C", sand: "#181818", input: "#242424",
};

export default function LoginPage({ onLogin }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMusicLogin({
    mutation: {
      onSuccess: (data) => { storage.setSession(data.name); onLogin(data.name); },
      onError: () => setError("الباسورد غلط، جرّب تاني"),
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("اكتب اسمك الأول"); return; }
    setError(null);
    login.mutate({ data: { name: name.trim(), password } });
  };

  return (
    <div
      style={{
        minHeight: "100dvh", background: C.background,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 22, overflow: "hidden", position: "relative",
        direction: "rtl",
      }}
    >
      {/* Green glow */}
      <div style={{
        position: "absolute", width: 340, height: 340, borderRadius: "50%",
        background: "rgba(29,185,84,0.24)", top: 70, right: -120, pointerEvents: "none",
      }} />

      {/* Card */}
      <div
        className="fade-up"
        style={{
          background: C.sand, borderRadius: 34, padding: 24, width: "100%", maxWidth: 400,
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)", position: "relative",
        }}
      >
        {/* Logo circle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 4 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 38, background: C.primary,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
            boxShadow: "0 0 30px #1DB95460",
          }}>
            <img src="/logo.png" alt="logo" style={{ width: 60, height: 60, borderRadius: "50%" }} />
          </div>
          <h1 style={{ color: C.foreground, fontSize: 38, fontWeight: 700, letterSpacing: -1.3 }}>music&sk</h1>
          <p style={{ color: C.mutedFg, fontSize: 15, fontWeight: 500, marginTop: 8, marginBottom: 22, lineHeight: "22px" }}>
            مساحتك الخاصة للمزيكا
          </p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <input
            type="text"
            placeholder="اسمك"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              height: 56, border: `1.5px solid ${C.border}`, borderRadius: 18,
              paddingInline: 16, fontSize: 16, fontWeight: 600, color: C.foreground,
              background: C.input, outline: "none", width: "100%", direction: "rtl",
              fontFamily: "inherit", marginBottom: 12,
            }}
            onFocus={e => (e.target.style.borderColor = C.primary)}
            onBlur={e => (e.target.style.borderColor = C.border)}
          />

          <input
            type="password"
            placeholder="الباسورد"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={e => e.key === "Enter" && submit(e as any)}
            style={{
              height: 56, border: `1.5px solid ${error ? C.destructive : C.border}`, borderRadius: 18,
              paddingInline: 16, fontSize: 16, fontWeight: 600, color: C.foreground,
              background: C.input, outline: "none", width: "100%", direction: "rtl",
              fontFamily: "inherit", marginBottom: 12,
            }}
            onFocus={e => (e.target.style.borderColor = error ? C.destructive : C.primary)}
            onBlur={e => (e.target.style.borderColor = error ? C.destructive : C.border)}
          />

          {error && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              border: `1px solid ${C.destructive}88`, borderRadius: 12,
              padding: "10px 12px", marginBottom: 10,
              background: `${C.destructive}22`, color: C.destructive,
              fontSize: 14, fontWeight: 600,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            style={{
              height: 56, borderRadius: 20, border: "none", cursor: "pointer",
              background: C.primary, color: C.primaryFg,
              fontSize: 17, fontWeight: 700, fontFamily: "inherit",
              marginTop: 6, opacity: login.isPending ? 0.8 : 1,
              transition: "transform 0.1s", transform: "scale(1)",
            }}
            onMouseDown={e => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
          >
            {login.isPending ? "جارٍ الدخول..." : "دخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
