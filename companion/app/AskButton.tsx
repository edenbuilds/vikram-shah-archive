"use client";
import { MessageSquareQuote } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// One Ask button everywhere. Inside a matter it opens with that matter as the source;
// on a paper, with just that paper.
export default function AskButton() {
  const path = usePathname();
  const m = path.match(/^\/m\/([^/]+)(?:\/d\/([^/?]+))?/);
  const qs = m ? `?m=${m[1]}${m[2] ? `&src=${m[2]}` : ""}` : "";
  return <Link href={`/ask${qs}`} className="btn small" style={{ flex: "0 0 auto" }}><MessageSquareQuote size={16} strokeWidth={1.75} aria-hidden /> Ask</Link>;
}
