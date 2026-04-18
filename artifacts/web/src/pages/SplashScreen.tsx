import { useEffect, useState } from "react";

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "stay" | "out">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("stay"), 600);
    const t2 = setTimeout(() => setPhase("out"), 2800);
    const t3 = setTimeout(() => onDone(), 3300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onDone]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50"
      style={{
        opacity: phase === "out" ? 0 : 1,
        transition: phase === "out" ? "opacity 0.5s ease-in-out" : undefined,
      }}
    >
      <div className="relative flex items-center justify-center">
        <div
          className="splash-ring absolute rounded-full border-2 border-[#1DB954]"
          style={{ width: 200, height: 200 }}
        />
        <div
          className="splash-ring-2 absolute rounded-full border border-[#1DB954]"
          style={{ width: 200, height: 200 }}
        />

        <img
          src="/logo.png"
          alt="music&sk"
          className="splash-logo relative z-10 select-none"
          style={{ width: 130, height: 130, borderRadius: "50%" }}
          draggable={false}
        />
      </div>

      <div
        className="mt-10 text-center"
        style={{
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "translateY(12px)" : "translateY(0)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}
      >
        <h1
          className="text-white font-bold tracking-widest uppercase"
          style={{ fontSize: 28, letterSpacing: "0.25em" }}
        >
          music&sk
        </h1>
        <p className="text-[#1DB954] mt-2 text-sm tracking-wider uppercase font-medium">
          مساحتك الخاصة للمزيكا
        </p>
      </div>

      <div
        className="flex items-end gap-[5px] mt-12"
        style={{
          opacity: phase === "in" ? 0 : 1,
          transition: "opacity 0.8s ease 0.3s",
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="wave-bar bg-[#1DB954] rounded-full"
            style={{
              width: 5,
              height: 28 + (i % 3) * 8,
              animationDelay: `${i * 0.12}s`,
              animationDuration: `${0.6 + (i % 3) * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
