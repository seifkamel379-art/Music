import { useState } from "react";
import { useMusicLogin } from "@workspace/api-client-react";
import { storage } from "@/lib/storage";

interface Props {
  onLogin: (name: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const login = useMusicLogin({
    mutation: {
      onSuccess: (data) => {
        storage.setSession(data.name);
        onLogin(data.name);
      },
      onError: () => {
        setError("الباسورد غلط، جرّب تاني");
      },
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
      className="min-h-dvh bg-black flex items-center justify-center px-4"
      style={{ direction: "rtl" }}
    >
      <div
        className="fade-in w-full max-w-sm"
        style={{
          background: "radial-gradient(ellipse at top, #1a2a1a 0%, #000 70%)",
          borderRadius: 20,
          border: "1px solid #1DB95430",
          padding: "40px 32px",
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <div
            className="mb-5 relative"
            style={{
              filter: "drop-shadow(0 0 24px #1DB95480)",
            }}
          >
            <img
              src="/logo.png"
              alt="logo"
              style={{ width: 80, height: 80, borderRadius: "50%" }}
            />
          </div>
          <h1 className="text-white font-bold text-2xl tracking-wide">music&sk</h1>
          <p className="text-[#888] text-sm mt-1">مساحتك الخاصة للمزيكا</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="اسمك"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none transition-all"
            style={{
              background: "#111",
              border: "1px solid #333",
              fontFamily: "inherit",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#1DB954")}
            onBlur={(e) => (e.target.style.borderColor = "#333")}
          />

          <input
            type="password"
            placeholder="الباسورد"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none transition-all"
            style={{
              background: "#111",
              border: `1px solid ${error ? "#e22134" : "#333"}`,
              fontFamily: "inherit",
            }}
            onFocus={(e) => (e.target.style.borderColor = error ? "#e22134" : "#1DB954")}
            onBlur={(e) => (e.target.style.borderColor = error ? "#e22134" : "#333")}
          />

          {error && (
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
              style={{ background: "#e2213422", border: "1px solid #e2213455", color: "#f15e6c" }}
            >
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-xl py-3 font-bold text-black text-base mt-1 transition-all active:scale-95"
            style={{ background: "#1DB954", fontFamily: "inherit" }}
          >
            {login.isPending ? (
              <span className="inline-block animate-spin">◌</span>
            ) : (
              "دخول"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
