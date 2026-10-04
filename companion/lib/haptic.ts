// Touch feedback (04-10-2026: Omkar asked for haptic touch). Android browsers vibrate. iPhones (iOS 17.4 and later) ignore
// vibrate() but give a tick when a hidden switch input is toggled by a tap, so we toggle one. Per device, off in Settings,
// Display, "Touch feedback" (data-a11y-haptics). Call it from a tap handler or right after a save: a browser only allows
// feedback close to a touch, and it does nothing on a laptop.
const PATTERNS = { tick: 8, ok: [10, 50, 10], warn: [30, 50, 30] } as const;
let sw: HTMLLabelElement | undefined;
export function haptic(kind: keyof typeof PATTERNS = "tick") {
  if (typeof document === "undefined" || document.documentElement.dataset.a11yHaptics === "off") return;
  if (navigator.vibrate) { navigator.vibrate(PATTERNS[kind] as number | number[]); return; }
  if (!sw) {
    sw = document.createElement("label"); sw.setAttribute("aria-hidden", "true");
    sw.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";
    sw.innerHTML = '<input type="checkbox" switch tabindex="-1">'; document.body.append(sw);
  }
  sw.click();
}
