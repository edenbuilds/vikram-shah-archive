// The mark: a C opening to the right, with one dot beside it where the companion sits. Plain SVG with literal
// colours so the same element draws the tab icon, the phone icons and the social preview (next/og) as well as the
// page. `draw` plays the stroke-on loop used by the loading page (globals.css .logo-draw).
export default function Logo({ size = 28, draw = false as boolean | "once", box = true, ink = box ? "#faf9f6" : "#0007cb" }: { size?: number; draw?: boolean | "once"; box?: boolean; ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={draw ? `logo-draw${draw === "once" ? " once" : ""}` : undefined} aria-hidden>
      {box && <rect width="32" height="32" rx="7" fill="#0007cb" />}
      <path className="arc" pathLength={100} d="M21.66 10.34A8 8 0 1 0 21.66 21.66" fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
      <circle className="dot" cx="24" cy="16" r="2" fill={ink} />
    </svg>
  );
}
