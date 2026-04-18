import { useEffect, useState } from "react";

interface Props { onDone: () => void; }

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "stay" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("stay"), 500);
    const t2 = setTimeout(() => setPhase("out"), 2800);
    const t3 = setTimeout(() => onDone(), 3350);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#000", zIndex: 100,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.55s ease-in-out" : undefined,
      }}
    >
      {/* Rings */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          className="splash-ring"
          style={{
            position: "absolute", width: 200, height: 200,
            borderRadius: "50%", border: "2px solid #1DB954",
          }}
        />
        <div
          className="splash-ring-2"
          style={{
            position: "absolute", width: 200, height: 200,
            borderRadius: "50%", border: "1.5px solid #1DB95480",
          }}
        />

        {/* Logo */}
        <img
          src="/logo.png"
          alt="music&sk"
          className="splash-logo"
          style={{ width: 128, height: 128, borderRadius: "50%", position: "relative", zIndex: 2, userSelect: "none" }}
          draggable={false}
        />
      </div>

      {/* Text */}
      <div
        style={{
          marginTop: 40, textAlign: "center",
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(14px)" : "translateY(0)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}
      >
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase" }}>
          music&sk
        </h1>
        <p style={{ color: "#1DB954", marginTop: 8, fontSize: 14, letterSpacing: "0.12em", fontWeight: 500 }}>
          مساحتك الخاصة للمزيكا
        </p>
      </div>

      {/* Wave bars */}
      <div
        style={{
          display: "flex", alignItems: "flex-end", gap: 5, marginTop: 48,
          opacity: phase === "in" ? 0 : 1,
          transition: "opacity 0.8s ease 0.25s",
        }}
      >
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="wave-bar"
            style={{
              width: 5, height: 26 + (i % 3) * 10,
              background: "#1DB954", borderRadius: 999,
              animationDelay: `${i * 0.11}s`,
              animationDuration: `${0.6 + (i % 3) * 0.18}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
