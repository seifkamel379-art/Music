import { useState } from "react";
import { storage } from "@/lib/storage";
import { useTheme } from "@/contexts/ThemeContext";

interface Props { onLogin: (name: string) => void; }

export default function LoginPage({ onLogin }: Props) {
  const { colors: C, themeMode, toggleTheme } = useTheme();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nameFocus, setNameFocus] = useState(false);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const n = name.trim();
    if (!n) { setError("اكتب اسمك الأول"); return; }
    storage.setSession(n);
    onLogin(n);
  };

  return (
    <div style={{
      minHeight: "100dvh", background: C.background,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 22, overflow: "hidden", position: "relative", direction: "rtl",
    }}>
      <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", background: "rgba(29,185,84,0.18)", top: 70, right: -120, pointerEvents: "none" }} />

      <button onClick={toggleTheme} title={themeMode === "dark" ? "وضع النهار" : "وضع الليل"} style={{ position: "absolute", top: 64, right: 20, width: 46, height: 46, borderRadius: 23, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {themeMode === "dark"
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        }
      </button>

      <div className="fade-up" style={{ background: C.sand, borderRadius: 34, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,0.25)", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, boxShadow: "0 0 30px #1DB95460" }}>
            <svg viewBox="0 0 168 168" width="52" height="52" xmlns="http://www.w3.org/2000/svg">
              <path fill="#000" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.6 121.2c-1.5 2.5-4.8 3.3-7.3 1.8-19.9-12.2-45-15-74.6-8.2-2.8.6-5.7-.9-6.4-3.8-.6-2.8.9-5.7 3.8-6.4 32.4-7.4 60.2-4.2 82.7 9.5 2.5 1.5 3.3 4.8 1.8 7.1zm10.3-22.9c-1.9 3.1-6 4.1-9.1 2.2-22.8-14-57.5-18-84.4-9.8-3.5 1-7.2-1-8.2-4.5s1-7.2 4.5-8.2c30.8-9.3 69.1-4.8 95.3 11.2 3.1 1.9 4.1 6 1.9 9.1zm.9-23.8C108.1 57.7 63.4 56.1 38.8 64c-4.2 1.3-8.6-1.1-9.9-5.2-1.3-4.2 1.1-8.6 5.2-9.9 28.5-8.6 75.8-7 105.8 11 3.8 2.3 5 7.2 2.7 11-.1.1-.1.2-.2.3-2.2 3.8-7.1 5.1-10.6 2.2z"/>
            </svg>
          </div>
          <h1 style={{ color: C.foreground, fontSize: 42, fontWeight: 800, letterSpacing: -2, margin: 0 }}>seifoo</h1>
          <p style={{ color: C.mutedForeground, fontSize: 15, fontWeight: 500, marginTop: 8, marginBottom: 0 }}>مساحتك الخاصة للمزيكا 🎵</p>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            placeholder="اكتب اسمك..."
            value={name}
            onChange={e => { setName(e.target.value); setError(null); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            onFocus={() => setNameFocus(true)}
            onBlur={() => setNameFocus(false)}
            autoFocus
            style={{
              height: 58, border: `1.5px solid ${error ? C.destructive : nameFocus ? C.primary : C.border}`,
              borderRadius: 18, paddingInline: 18, fontSize: 18, fontWeight: 600,
              color: C.foreground, background: C.input, outline: "none", width: "100%",
              direction: "rtl", fontFamily: "inherit", transition: "border-color 0.15s",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.destructive}88`, borderRadius: 12, padding: "10px 14px", background: `${C.destructive}22`, color: C.destructive, fontSize: 14, fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{ height: 58, borderRadius: 29, border: "none", cursor: "pointer", background: C.primary, color: "#000", fontSize: 18, fontWeight: 800, fontFamily: "inherit", marginTop: 4, letterSpacing: -0.5 }}
          >
            ابدأ الاستماع 🎧
          </button>
        </form>
      </div>
    </div>
  );
}
