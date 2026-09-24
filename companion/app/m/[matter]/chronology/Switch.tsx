import Link from "next/link";

export default function Switch({ matter, on }: { matter: string; on: "mine" | "papers" }) {
  return (
    <nav className="switch" aria-label="Chronology">
      <Link href={`/m/${matter}/chronology`} aria-current={on === "mine" ? "page" : undefined}>Your chronology</Link>
      <Link href={`/m/${matter}/chronology/papers`} aria-current={on === "papers" ? "page" : undefined}>Dates in the papers</Link>
    </nav>
  );
}
