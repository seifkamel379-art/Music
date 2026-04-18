import { useState } from "react";
import { storage } from "@/lib/storage";
import { useTheme } from "@/contexts/ThemeContext";

const PASS = "80808016";

interface Props { onLogin: (name: string) => void; }

export default function LoginPage({ onLogin }: Props) {
  const { colors: C, themeMode, toggleTheme } = useTheme();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameFocus, setNameFocus] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) { setError("اكتب اسمك الأول"); return; }
    if (password !== PASS) { setError("الباسورد غلط، جرّب تاني"); return; }
    const n = name.trim();
    storage.setSession(n);
    onLogin(n);
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.background, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, overflow: "hidden", position: "relative", direction: "rtl" }}>

      {/* Green glow */}
      <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", background: "rgba(29,185,84,0.18)", top: 70, right: -120, pointerEvents: "none" }} />

      {/* Theme toggle */}
      <button onClick={toggleTheme} title={themeMode === "dark" ? "وضع النهار" : "وضع الليل"} style={{ position: "absolute", top: 64, right: 20, width: 46, height: 46, borderRadius: 23, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {themeMode === "dark"
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        }
      </button>

      {/* Card */}
      <div className="fade-up" style={{ background: C.sand, borderRadius: 34, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", position: "relative" }}>

        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 4 }}>
          <div style={{ width: 76, height: 76, borderRadius: 38, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 0 30px #1DB95460" }}>
            <img src="/logo.png" alt="logo" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} />
          </div>
          <h1 style={{ color: C.foreground, fontSize: 38, fontWeight: 700, letterSpacing: -1.3, margin: 0 }}>music&sk</h1>
          <p style={{ color: C.mutedForeground, fontSize: 15, fontWeight: 500, marginTop: 8, marginBottom: 22, lineHeight: "22px" }}>مساحتك الخاصة للمزيكا</p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column" }}>
          <input
            type="text" placeholder="اسمك" value={name}
            onChange={e => setName(e.target.value)}
            onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)}
            style={{ height: 56, border: `1.5px solid ${nameFocus ? C.primary : C.border}`, borderRadius: 18, paddingInline: 16, fontSize: 16, fontWeight: 600, color: C.foreground, background: C.input, outline: "none", width: "100%", direction: "rtl", fontFamily: "inherit", marginBottom: 12, transition: "border-color 0.15s" }}
          />
          <input
            type="password" placeholder="الباسورد" value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            onFocus={() => setPwFocus(true)} onBlur={() => setPwFocus(false)}
            style={{ height: 56, border: `1.5px solid ${error ? C.destructive : pwFocus ? C.primary : C.border}`, borderRadius: 18, paddingInline: 16, fontSize: 16, fontWeight: 600, color: C.foreground, background: C.input, outline: "none", width: "100%", direction: "rtl", fontFamily: "inherit", marginBottom: 12, transition: "border-color 0.15s" }}
          />

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.destructive}88`, borderRadius: 12, padding: "10px 12px", marginBottom: 10, background: `${C.destructive}22`, color: C.destructive, fontSize: 14, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button type="submit" style={{ height: 56, borderRadius: 20, border: "none", cursor: "pointer", background: C.primary, color: C.primaryForeground, fontSize: 17, fontWeight: 700, fontFamily: "inherit", marginTop: 6 }}>
            دخول
          </button>
        </form>
      </div>
    </div>
  );
}
