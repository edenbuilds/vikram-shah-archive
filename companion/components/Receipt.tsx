import Link from "next/link";
import PinButton from "./PinButton";
import { pageLabel } from "@/lib/printed";

// One receipt: the exact words, the paper and page (linked to the scan), and a Pin button.
export default function Receipt({ matter, doc, page, quote, title, img, pinned, printed }: {
  matter: string; doc: string; page: number; quote: string; title: string; img?: string; pinned?: boolean; printed?: number;
}) {
  return (
    <div className="receipt-wrap">
      <Link href={`/m/${matter}/d/${doc}?p=${page}`} className="receipt">
        {img ? <img src={img} alt={`Scan of ${title}, page ${page}`} loading="lazy" /> : <span className="noimg" aria-hidden />}
        <span>
          <q>{quote.replace(/\s+/g, " ")}</q>
          <cite>{title}, {pageLabel(page, printed)} →</cite>
        </span>
      </Link>
      <PinButton matter={matter} doc={doc} page={page} quote={quote} on={pinned} />
    </div>
  );
}
