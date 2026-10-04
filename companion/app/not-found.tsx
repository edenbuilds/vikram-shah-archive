import Link from "next/link";
import Logo from "@/components/Logo";

export const metadata = { title: "Not found" };
export default function NotFound() {
  return (
    <main className="wrap stack" style={{ gap: "1rem", justifyItems: "start", paddingBlock: "4rem" }}>
      <Logo size={40} />
      <h1>That page is not here</h1>
      <p className="muted">It may have been moved, or the link was copied wrongly.</p>
      <Link className="btn" href="/">Back to your matters</Link>
    </main>
  );
}
