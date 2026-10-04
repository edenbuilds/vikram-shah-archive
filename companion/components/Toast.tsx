"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

// 04-10-2026: one quiet confirmation after a save that actually landed. Callers fire toast() only after
// the awaited server action returns (a failed action throws first), so "Saved" is never a guess.
type T = { id: number; text: string };
export function toast(text: string) { dispatchEvent(new CustomEvent("cc-toast", { detail: text })); }

export default function Toaster() {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = { id: Date.now() + Math.random(), text: (e as CustomEvent<string>).detail };
      setItems((xs) => [...xs.slice(-2), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 2800);
    };
    addEventListener("cc-toast", on);
    return () => removeEventListener("cc-toast", on);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div key={t.id} className="toast" layout drag="x" dragSnapToOrigin
            onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 80) setItems((xs) => xs.filter((x) => x.id !== t.id)); }}
            initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.15 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}>
            <i aria-hidden className="dot" />{t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
