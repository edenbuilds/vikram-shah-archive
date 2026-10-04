"use client";
import Logo from "@/components/Logo";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap stack" style={{ gap: "1rem", justifyItems: "start", paddingBlock: "4rem" }}>
      <Logo size={40} />
      <h1>That did not load</h1>
      <p className="muted">Nothing was lost. Try again, and if it keeps happening, tell Omkar.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </main>
  );
}
