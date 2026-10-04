"use client";
import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";

// 04-10-2026: Omkar asked for accessibility settings. Per device (a phone and the iPad can differ), kept in
// localStorage and applied as data- attributes on <html> before paint (A11Y_BOOT in app/layout.tsx).
export const A11Y_KEY = "cc-a11y";
const OPTIONS = {
  size: { label: "Text size", choices: [["m", "Standard"], ["l", "Large"], ["xl", "Larger"]] },
  spacing: { label: "Line spacing", choices: [["m", "Standard"], ["l", "Relaxed"]] },
  reading: { label: "Reading font", choices: [["sans", "Sans"], ["serif", "Serif"]] },
  weight: { label: "Text weight", choices: [["m", "Standard"], ["b", "Heavier"]] },
  contrast: { label: "Contrast", choices: [["m", "Standard"], ["high", "High"]] },
  motion: { label: "Motion", choices: [["m", "As the device"], ["reduce", "Reduced"]] },
  haptics: { label: "Touch feedback", choices: [["m", "On"], ["off", "Off"]] },
  links: { label: "Links", choices: [["m", "Plain"], ["underline", "Always underlined"]] },
} as const;
type Key = keyof typeof OPTIONS;
export const A11Y_BOOT = `try{var p=JSON.parse(localStorage.getItem("${A11Y_KEY}")||"{}");for(var k in p)document.documentElement.dataset["a11y"+k[0].toUpperCase()+k.slice(1)]=p[k]}catch(e){}`;

export default function A11yPrefs() {
  const [p, setP] = useState<Partial<Record<Key, string>>>({});
  useEffect(() => { try { setP(JSON.parse(localStorage.getItem(A11Y_KEY) || "{}")); } catch {} }, []);
  const set = (k: Key, v: string) => {
    const next = { ...p, [k]: v };
    setP(next);
    const attr = "a11y" + k[0].toUpperCase() + k.slice(1);
    if (v === OPTIONS[k].choices[0][0]) delete document.documentElement.dataset[attr]; else document.documentElement.dataset[attr] = v;
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(next)); } catch {}
    toast("Saved on this device");
  };
  return (
    <div className="a11y">
      {(Object.keys(OPTIONS) as Key[]).map((k) => (
        <fieldset key={k} className="a11y-row">
          <legend>{OPTIONS[k].label}</legend>
          <div className="seg" role="radiogroup" aria-label={OPTIONS[k].label}>
            {OPTIONS[k].choices.map(([v, l]) => {
              const on = (p[k] ?? OPTIONS[k].choices[0][0]) === v;
              return <button key={v} type="button" role="radio" aria-checked={on} className={on ? "on" : undefined} onClick={() => set(k, v)}>{l}</button>;
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
