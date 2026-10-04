"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

// 04-10-2026: one quiet confirmation after a save that actually landed. Callers fire toast() only after
// the awaited server action returns (a failed action throws first), so "Saved" is never a guess.
// Omkar then asked for a toast on every interaction: Toaster also watches every server action the page
// sends (the Next-Action requests) and confirms the ones that answered, or says it could not, unless the
// caller already toasted. The tone picks the colour: ok green, info violet, warn amber, error red.
export type Tone = "ok" | "info" | "warn" | "error";
type T = { id: number; text: string; tone: Tone; href?: string };
let lastExplicit = 0;
export function toast(text: string, opts: { tone?: Tone; href?: string } = {}) {
  lastExplicit = Date.now();
  dispatchEvent(new CustomEvent("cc-toast", { detail: { text, ...opts } }));
}

const sayFor = (form: HTMLFormElement | null, button: HTMLElement | null) => {
  const given = form?.dataset.done ?? button?.dataset.done;
  if (given) return given;
  const label = (button?.textContent ?? "").toLowerCase();
  if (/remove|delete|forget|unpin|archive/.test(label)) return "Removed";
  if (/add|create|new|upload/.test(label)) return "Added";
  return "Saved";
};

export default function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; tone?: Tone; href?: string }>).detail;
      const t: T = { id: Date.now() + Math.random(), text: d.text, tone: d.tone ?? "ok", href: d.href };
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), d.href ? 6000 : 2800);
    };
    addEventListener("cc-toast", on);

    let from: { form: HTMLFormElement | null; button: HTMLElement | null } = { form: null, button: null };
    const mark = (e: Event) => {
      const el = e.target as HTMLElement | null;
      const sub = e instanceof SubmitEvent ? (e.submitter as HTMLElement | null) : el?.closest<HTMLElement>("button") ?? null;
      from = { form: el instanceof HTMLFormElement ? el : el?.closest("form") ?? null, button: sub };
    };
    document.addEventListener("submit", mark, true); document.addEventListener("click", mark, true);

    const real = window.fetch;
    window.fetch = async (input, init) => {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("next-action")) return real(input, init);
      const t0 = Date.now(), who = from;
      let ok = false;
      try { const res = await real(input, init); ok = res.ok; return res; } finally {
        setTimeout(() => { if (lastExplicit < t0) toast(ok ? sayFor(who.form, who.button) : "That did not save. Try again.", { tone: ok ? "ok" : "error" }); }, 700);
      }
    };
    return () => { removeEventListener("cc-toast", on); document.removeEventListener("submit", mark, true); document.removeEventListener("click", mark, true); window.fetch = real; };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div key={t.id} className={`toast tone-${t.tone}`} layout drag="x" dragSnapToOrigin
            onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 80) setItems((xs) => xs.filter((x) => x.id !== t.id)); }}
            initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
            <i aria-hidden className="dot" />{t.text}
            {t.href && <Link href={t.href} className="toast-link" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>Open</Link>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
