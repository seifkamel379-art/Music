import { useEffect, useState } from "react";

interface Props { onDone: () => void; }

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "stay" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("stay"), 400);
    const t2 = setTimeout(() => setPhase("out"), 2600);
    const t3 = setTimeout(() => onDone(), 3100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000", zIndex: 100,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      opacity: phase === "out" ? 0 : 1,
      transition: phase === "out" ? "opacity 0.5s ease-in-out" : undefined,
    }}>
      {/* Ripple rings */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="splash-ring" style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", border: "1.5px solid #1DB954" }} />
        <div className="splash-ring-2" style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", border: "1px solid #1DB95460" }} />

        {/* Logo */}
        <div className="splash-logo" style={{ width: 120, height: 120, borderRadius: "50%", position: "relative", zIndex: 2, background: "#1DB954", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px #1DB95466" }}>
          <svg viewBox="0 0 168 168" width="90" height="90" xmlns="http://www.w3.org/2000/svg">
            <path fill="#000" d="M84 0C37.6 0 0 37.6 0 84s37.6 84 84 84 84-37.6 84-84S130.4 0 84 0zm38.6 121.2c-1.5 2.5-4.8 3.3-7.3 1.8-19.9-12.2-45-15-74.6-8.2-2.8.6-5.7-.9-6.4-3.8-.6-2.8.9-5.7 3.8-6.4 32.4-7.4 60.2-4.2 82.7 9.5 2.5 1.5 3.3 4.8 1.8 7.1zm10.3-22.9c-1.9 3.1-6 4.1-9.1 2.2-22.8-14-57.5-18-84.4-9.8-3.5 1-7.2-1-8.2-4.5s1-7.2 4.5-8.2c30.8-9.3 69.1-4.8 95.3 11.2 3.1 1.9 4.1 6 1.9 9.1zm.9-23.8C108.1 57.7 63.4 56.1 38.8 64c-4.2 1.3-8.6-1.1-9.9-5.2-1.3-4.2 1.1-8.6 5.2-9.9 28.5-8.6 75.8-7 105.8 11 3.8 2.3 5 7.2 2.7 11-.1.1-.1.2-.2.3-2.2 3.8-7.1 5.1-10.6 2.2z"/>
          </svg>
        </div>
      </div>

      {/* Title */}
      <div style={{ marginTop: 40, textAlign: "center", opacity: phase === "in" ? 0 : 1, transform: phase === "in" ? "translateY(14px)" : "translateY(0)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
        <h1 style={{ color: "#fff", fontSize: 36, fontWeight: 800, letterSpacing: "-0.05em", margin: 0 }}>seifoo</h1>
        <p style={{ color: "#1DB954", marginTop: 8, fontSize: 14, letterSpacing: "0.1em", fontWeight: 500 }}>مساحتك الخاصة للمزيكا</p>
      </div>

      {/* Wave bars */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, marginTop: 44, opacity: phase === "in" ? 0 : 1, transition: "opacity 0.8s ease 0.3s" }}>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="wave-bar" style={{ width: 5, height: 20 + (i % 3) * 12, background: "#1DB954", borderRadius: 999, animationDelay: `${i * 0.11}s`, animationDuration: `${0.6 + (i % 3) * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}
