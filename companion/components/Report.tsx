"use client";
import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { haptic } from "@/lib/haptic";
import { toast } from "@/components/Toast";
import RubberSegment from "@/components/rb/RubberSegment";

// 06-10-2026: Omkar: "an active interaction for any page, any section: double taps, double clicks, haptic, 3D touch: the user can
// report a bug, it takes the context and the screenshot and sends an email". Delegated from the document like Touch.tsx, and
// built so it never fights it:
//  - a double-click or double-tap, or a press and hold, on EMPTY space opens a one-item menu "Report a problem here"; a firm press
//    on a Mac trackpad (webkitmouseforcedown) does the same. Real 3D Touch is gone from iPhones, so hold is its stand-in.
//  - never over a control, a link, text (a selection exists), the board's sortable cards, a card Touch.tsx already owns, an
//    element marked data-no-report, or this dialog. Cards get "Report a problem here" inside Touch's own hold menu instead.
//  - the top-right menu and the share menu can open it too (event "report:open"), so a keyboard user has a way in.
// The screenshot is drawn in the browser (html2canvas-pro, MIT) from the visible screen only, with the pointed element outlined,
// and is optional: a page it cannot draw still reports. Nothing leaves the page until she presses Send.
type Open = { el?: Element | null; x?: number; y?: number; how: string };
declare global { interface WindowEventMap { "report:open": CustomEvent<Open> } }
export const reportHere = (d: Open) => dispatchEvent(new CustomEvent("report:open", { detail: d }));

const BLOCK = "a, button, input, textarea, select, summary, label, [contenteditable], [data-dbl], [role=button], [role=tab], [role=menuitem], [role=slider], [aria-roledescription], canvas, video, audio, dialog, .quick-menu, .account-menu, .toast, .pillnav, [data-report-ui], [data-no-report]";
const OWNED = "a.matter-card, a.docrow, a.stat";  // Touch.tsx holds these
const WHOLE = "button, a, input, select, textarea, summary, img, h1, h2, h3, h4, label, li, p, tr, td, th, figure, [role], .card, .stat, section, article, form";
const KINDS = [{ value: "visual", label: "Looks wrong" }, { value: "function", label: "Does not work" }, { value: "feature", label: "Feature" }, { value: "other", label: "Other" }];

const errors: string[] = [];
const keep = (m: unknown) => { errors.push(String(m).replace(/\s+/g, " ").slice(0, 240)); if (errors.length > 8) errors.shift(); };
// A real word selection is under the pointer (a phone's long press, a double-click on text). Firefox also selects the nearest word when
// the double-click lands in empty margin: that selection is not under the pointer, so it does not count (and is cleared).
const overSelection = (x: number, y: number) => {
  const s = getSelection();
  if (!s?.rangeCount || !s.toString().trim()) return false;
  return [...s.getRangeAt(0).getClientRects()].some((r) => x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3);
};
const idle = (t: EventTarget | null) => t instanceof Element && !t.closest(BLOCK) && !t.closest(OWNED);

function selectorOf(el: Element): string {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
    let p = e.tagName.toLowerCase();
    if (e.id && !/\d{3,}|:/.test(e.id)) { parts.unshift(`${p}#${CSS.escape(e.id)}`); break; }
    const cls = [...e.classList].filter((c) => !/^(css-|_)|[0-9a-f]{6,}/.test(c)).slice(0, 2);
    if (cls.length) p += "." + cls.map((c) => CSS.escape(c)).join(".");
    const same = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e!.tagName) : [];
    if (same.length > 1) p += `:nth-of-type(${same.indexOf(e) + 1})`;
    parts.unshift(p);
  }
  return parts.join(" > ");
}
const words = (t: string | null | undefined, n: number) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const inner = (e: Element) => (e as HTMLElement).innerText;

// What she pointed at: the closest whole thing (a button, a card, a heading), not the span inside it. Whole-screen wrappers count as "nothing".
function pointed(el: Element | null) {
  if (!el || el === document.documentElement || el === document.body) return null;
  const t = el.closest(WHOLE) ?? el, r = t.getBoundingClientRect();
  if (t.id === "main" || r.width * r.height > innerWidth * innerHeight * 0.8) return null;
  return { t, r };
}

function capture(el: Element | null, how: string) {
  const p = pointed(el), fail = (performance.getEntriesByType("resource") as (PerformanceResourceTiming & { responseStatus?: number })[])
    .filter((e) => (e.responseStatus ?? 0) >= 400).slice(-6).map((e) => `${e.responseStatus} ${new URL(e.name).pathname}`);
  const crumbs: string[] = [];
  for (let e = p?.t.parentElement ?? null; e && crumbs.length < 5; e = e.parentElement) {
    if (e.matches("section, article, nav, main, form, dialog, details, [aria-label]")) crumbs.unshift(words(e.getAttribute("aria-label") ?? e.querySelector("h1, h2, h3, summary")?.textContent ?? e.id ?? e.tagName.toLowerCase(), 60));
  }
  const h1 = document.querySelector("h1");
  if (h1 && crumbs[0] !== words(inner(h1), 60)) crumbs.unshift(words(inner(h1), 60));
  const field = p && /^(INPUT|TEXTAREA|SELECT)$/.test(p.t.tagName);  // a field's value is hers: only its label and placeholder go
  return {
    url: location.href, title: document.title, how, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    scroll: [Math.round(scrollX), Math.round(scrollY)], touch: matchMedia("(pointer: coarse)").matches, touchPoints: navigator.maxTouchPoints,
    lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, online: navigator.onLine, ua: navigator.userAgent,
    target: p && {
      tag: p.t.tagName.toLowerCase(), role: p.t.getAttribute("role") ?? "", label: words(p.t.getAttribute("aria-label") ?? p.t.getAttribute("title") ?? p.t.getAttribute("alt") ?? (field ? p.t.getAttribute("placeholder") : ""), 120),
      text: field ? "" : words(inner(p.t), 200), selector: selectorOf(p.t), rect: [p.r.x, p.r.y, p.r.width, p.r.height].map(Math.round), crumbs,
    },
    around: p ? words(inner(p.t.closest("section, article, form, .card, li, main") ?? p.t), 600) : words(inner(document.querySelector("main") ?? document.body), 400),
    errors, failed: fail,
    prefs: Object.entries(document.documentElement.dataset).filter(([k]) => k.startsWith("a11y")).map(([k, v]) => `${k.slice(4).toLowerCase()} ${v}`).join(", "),
  };
}

// The visible screen only (a paper can be hundreds of pages tall), the element outlined in red, JPEG under ~2.4 MB so the request
// stays inside Vercel's 4.5 MB body limit. null on any failure: the report goes without it.
async function snap(mark: DOMRect | null): Promise<string | null> {
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const { default: html2canvas } = await import("html2canvas-pro");
    const w = innerWidth, h = innerHeight, scale = Math.min(devicePixelRatio || 1, 2, 1600 / w);
    const canvas = await Promise.race([
      html2canvas(document.documentElement, {
        x: scrollX, y: scrollY, width: w, height: h, windowWidth: w, windowHeight: h, scale, useCORS: true, logging: false, backgroundColor: "#faf9f6", imageTimeout: 3000,
        // 06-10-2026: html2canvas draws a copy of the page, and in the copy every entrance animation (main > * "rise") starts again from
        // opacity 0, so the first test report showed the header and a blank page. Stopping animations in the copy only leaves the live page alone. It also draws the inside of a closed <details> (the open account menu and
        // collapsed help text showed through), so those are hidden in the copy.
        onclone: (d) => { const st = d.createElement("style"); st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important} details:not([open])>:not(summary){display:none!important}"; d.head.appendChild(st); },
        ignoreElements: (el) => { if (el.hasAttribute("data-report-ui")) return true; const r = el.getBoundingClientRect(); return r.width > 0 && (r.bottom < -24 || r.top > h + 24); },
      }),
      new Promise<null>((ok) => setTimeout(() => ok(null), 9000)),
    ]);
    if (!canvas) return null;
    if (mark) {
      const c = canvas.getContext("2d")!; c.lineWidth = Math.max(2, 3 * scale); c.strokeStyle = "#d92d20";
      c.strokeRect(mark.x * scale - 2, mark.y * scale - 2, mark.width * scale + 4, mark.height * scale + 4);
    }
    let q = 0.82, out = canvas.toDataURL("image/jpeg", q);
    while (out.length > 2_400_000 && q > 0.4) out = canvas.toDataURL("image/jpeg", (q -= 0.14));
    return out.length > 3_000_000 ? null : out;
  } catch { return null; }
}

type Menu = { x: number; y: number; el: Element | null; how: string };

export default function Report() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);  // choosing what is wrong: the next click or tap only selects it, so a broken button can be reported without pressing it
  const ring = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState("other");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null | undefined>(undefined);  // undefined: still drawing, null: none
  const [where, setWhere] = useState("");
  const dlg = useRef<HTMLDialogElement>(null);
  const ctx = useRef<ReturnType<typeof capture> | null>(null);
  const shot = useRef<Promise<string | null>>(Promise.resolve(null));

  const start = (el: Element | null, how: string) => {
    setMenu(null);
    const c = capture(el, how), p = pointed(el);
    ctx.current = c; setKind("other"); setNote(""); setPreview(undefined); setBusy(false);
    setWhere(c.target ? `On ${c.target.label || c.target.text || c.target.tag}` : "On this screen");
    shot.current = snap(p?.r ?? null); shot.current.then(setPreview);
    setOpen(true);
  };
  useEffect(() => { if (open && !dlg.current?.open) dlg.current?.showModal(); }, [open]);

  useEffect(() => {  // what the browser logged, for the brief; console.error is wrapped, not replaced
    const err = (e: ErrorEvent) => keep(`${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})`);
    const rej = (e: PromiseRejectionEvent) => keep(`Unhandled rejection: ${e.reason?.message ?? e.reason}`);
    const log = console.error; console.error = (...a: unknown[]) => { keep(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : "")).join(" ")); log.apply(console, a); };
    addEventListener("error", err); addEventListener("unhandledrejection", rej);
    return () => { removeEventListener("error", err); removeEventListener("unhandledrejection", rej); console.error = log; };
  }, []);

  useEffect(() => {
    let timer: number | undefined, from = { x: 0, y: 0 }, held = false, shownAt = 0, last = { at: 0, x: 0, y: 0 };
    const show = (x: number, y: number, el: Element | null, how: string) => { shownAt = Date.now(); getSelection()?.removeAllRanges(); haptic("ok"); setMenu({ x, y, el, how }); };
    const cancel = () => { clearTimeout(timer); timer = undefined; };
    const down = (e: PointerEvent) => {
      held = false;
      if (!e.isPrimary || e.pointerType === "mouse" || !idle(e.target)) return;
      from = { x: e.clientX, y: e.clientY };
      const el = e.target as Element;
      timer = window.setTimeout(() => { timer = undefined; if (overSelection(from.x, from.y)) return; held = true; show(from.x, from.y, el, "hold"); }, 700);  // after Touch's 480 ms, and after a phone's own text selection has started
    };
    const move = (e: PointerEvent) => { if (timer && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 10) cancel(); };
    const up = (e: PointerEvent) => {
      cancel();
      if (e.pointerType === "mouse" || !e.isPrimary || !idle(e.target) || overSelection(e.clientX, e.clientY)) return;
      if (e.timeStamp - last.at < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) { last.at = 0; show(e.clientX, e.clientY, e.target as Element, "double"); }
      else last = { at: e.timeStamp, x: e.clientX, y: e.clientY };
    };
    const click = (e: MouseEvent) => { if (held) { held = false; e.preventDefault(); e.stopPropagation(); } };
    const context = (e: Event) => { if (held || timer) e.preventDefault(); };
    const dbl = (e: MouseEvent) => { if (Date.now() - shownAt > 500 && idle(e.target) && !overSelection(e.clientX, e.clientY)) show(e.clientX, e.clientY, e.target as Element, "double"); };
    const force = (e: Event) => { const m = e as MouseEvent; if (idle(e.target) && !overSelection(m.clientX, m.clientY)) show(m.clientX, m.clientY, e.target as Element, "force"); };
    const away = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest?.("[data-report-ui]")) setMenu(null); };
    const hide = () => setMenu(null);
    const ask = (e: CustomEvent<Open>) => { const d = e.detail; if (d.how === "menu" && !d.el) setPick(true); else requestAnimationFrame(() => start(d.el ?? null, d.how)); };
    document.addEventListener("pointerdown", down, true); document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true); document.addEventListener("click", click, true); document.addEventListener("contextmenu", context, true);
    document.addEventListener("dblclick", dbl); document.addEventListener("webkitmouseforcedown", force);
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", away); addEventListener("scroll", hide, { passive: true }); addEventListener("report:open", ask);
    return () => {
      document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true); document.removeEventListener("click", click, true); document.removeEventListener("contextmenu", context, true);
      document.removeEventListener("dblclick", dbl); document.removeEventListener("webkitmouseforcedown", force);
      document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", away); removeEventListener("scroll", hide); removeEventListener("report:open", ask);
    };
  }, []);


  // 06-10-2026: the gestures skip buttons, links and fields (a double click there must keep its own meaning), so "the Save button does
  // nothing" could not be pointed at. From the menu she now chooses the element: every click, tap and press is swallowed at the window
  // until she has chosen, and the choice is outlined as it is hovered.
  useEffect(() => {
    if (!pick) return;
    const ui = (e: Event) => !!(e.target as Element | null)?.closest?.("[data-report-ui]");
    const under = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return e && !e.closest("[data-report-ui]") ? e : null; };
    const stop = (e: Event) => { if (!ui(e)) e.stopImmediatePropagation(); };
    const hover = (e: PointerEvent) => {
      const r = pointed(under(e.clientX, e.clientY))?.r, o = ring.current; if (!o) return;
      o.style.display = r ? "block" : "none";
      if (r) Object.assign(o.style, { left: `${r.x - 2}px`, top: `${r.y - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    };
    const choose = (e: MouseEvent) => {
      if (ui(e)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const el = under(e.clientX, e.clientY); haptic("ok"); setPick(false);
      requestAnimationFrame(() => start(el, "picked"));
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPick(false); };
    const swallowed = ["pointerdown", "pointerup", "mousedown", "mouseup", "dblclick", "auxclick", "contextmenu"];
    swallowed.forEach((t) => addEventListener(t, stop, true));
    addEventListener("pointermove", hover, true); addEventListener("click", choose, true); addEventListener("keydown", esc, true);
    return () => {
      swallowed.forEach((t) => removeEventListener(t, stop, true));
      removeEventListener("pointermove", hover, true); removeEventListener("click", choose, true); removeEventListener("keydown", esc, true);
    };
  }, [pick]);

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const img = await Promise.race([shot.current, new Promise<null>((ok) => setTimeout(() => ok(null), 7000))]);
      const r = await fetch("/api/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, note, ctx: ctx.current, shot: img }) });
      const j = (await r.json().catch(() => ({}))) as { id?: string; mail?: string; error?: string };
      if (!r.ok || !j.id) { toast(j.error ?? "Could not send that. Try again.", { tone: "error" }); setBusy(false); return; }
      dlg.current?.close();
      toast(j.mail === "sent" ? `Sent. Reference ${j.id}` : `Saved as ${j.id}. The email did not leave; resend it from Settings.`, { tone: j.mail === "sent" ? "ok" : "warn", href: "/settings#reports" });
    } catch { toast("Could not send that. Check the connection and try again.", { tone: "error" }); setBusy(false); }
  };

  // the menu only exists after a gesture, so the window is there; reading it during the server render would throw
  const at = (m: Menu) => { const w = Math.min(256, innerWidth - 16); return { left: Math.max(8, Math.min(m.x - 20, innerWidth - w - 8)), top: Math.max(8, Math.min(m.y + 16, innerHeight - 70)) }; };
  return (
    <>
      {pick && (
        <>
          <div ref={ring} className="report-ring" data-report-ui aria-hidden />
          <div className="report-pick card" role="region" aria-label="Choose what is wrong" data-report-ui>
            <span>Tap or click what is wrong</span>
            <button type="button" className="btn small" onClick={() => { setPick(false); requestAnimationFrame(() => start(null, "menu")); }}>Whole screen</button>
            <button type="button" className="btn ghost small" onClick={() => setPick(false)}>Cancel</button>
          </div>
        </>
      )}
      {menu && (
        <div className="account-menu quick-menu" role="menu" aria-label="Report" data-report-ui style={at(menu)}>
          <button role="menuitem" autoFocus onClick={() => start(menu.el, menu.how)}><Flag size={15} strokeWidth={1.75} aria-hidden /> Report a problem here</button>
        </div>
      )}
      <dialog ref={dlg} className="card edit-dialog report-dialog" data-report-ui aria-labelledby="report-title" onClose={() => { setOpen(false); setBusy(false); }}
        onClick={(e) => { if (e.target === dlg.current && !busy) dlg.current?.close(); }}>
        {open && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div>
              <h2 id="report-title" style={{ margin: 0 }}>Report a problem</h2>
              <p className="subtle" style={{ margin: ".15rem 0 0" }}>{where}. This screen goes with it.</p>
            </div>
            <RubberSegment aria-label="What kind of problem" className="seg-rb" size="sm" value={kind} onChange={setKind} trackColor="var(--paper-deep)" thumbColor="var(--white)" textColor="var(--muted)" activeTextColor="var(--ink)" items={KINDS} />
            <label>What went wrong?
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder="e.g. The Save button is cut off" autoFocus={!matchMedia("(pointer: coarse)").matches} />
            </label>
            <div className="report-shot" aria-live="polite">
              {preview ? <img src={preview} alt="The screen as it will be sent" /> : <p className="subtle" style={{ margin: 0 }}>{preview === undefined ? "Taking a screenshot…" : "No screenshot on this device. The report still goes."}</p>}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn ghost" onClick={() => dlg.current?.close()} disabled={busy}>Cancel</button>
              <button className="btn" disabled={busy || (!note.trim() && !ctx.current?.target)}>{busy ? "Sending…" : "Send report"}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}

