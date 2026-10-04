import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { NextResponse } from "next/server";
import { withComments } from "@/lib/pdf-comments";
import { readInk } from "@/lib/ink";
import { joinerPage, pieceUrls, putFile, readFile } from "@/lib/pdf-file";
import { admin } from "@/lib/access";
import { getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

// One paper, several formats. PDF: a signed storage download of the stored file itself, so the
// bytes are exactly the file on record (and big files never pass through a serverless response).
// Word / Markdown / text: generated from the verbatim page text, one section per page.
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "paper";

export async function GET(req: Request, { params }: { params: Promise<{ matter: string; doc: string; format: string }> }) {
  const { matter, doc, format } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: d } = await supabase.from("documents").select("id, title, pdf_path, source_path, page_count").eq("id", doc).eq("matter_id", m.id).maybeSingle();
  if (!d) return new NextResponse("Not found", { status: 404 });
  const name = safe(d.title);

  const view = new URL(req.url).searchParams.has("view");  // open in the browser instead of saving
  // a stored file: one signed download, or (over 50 MB, stored in pieces) a page that joins the pieces
  const deliver = async (db: typeof supabase, key: string, filename: string) => {
    const { data } = await db.storage.from("companion").createSignedUrl(key, 600, view ? undefined : { download: filename });
    if (data) return NextResponse.redirect(data.signedUrl);
    const urls = await pieceUrls(db, key);
    return urls.length ? new NextResponse(joinerPage(urls, filename, view), { headers: { "content-type": "text/html; charset=utf-8" } }) : new NextResponse("PDF unavailable", { status: 404 });
  };

  if (format === "pdf") {
    if (!d.pdf_path) return new NextResponse("No PDF on file for this paper", { status: 404 });
    if (d.pdf_path.startsWith(`${m.id}/`) || !m.storage_base) return deliver(supabase, d.pdf_path, `${name}.pdf`);
    return NextResponse.redirect(`${m.storage_base}/${d.pdf_path}${view ? "" : `?download=${encodeURIComponent(`${name}.pdf`)}`}`);
  }

  // For LiquidText (no API; 04-10-2026): the paper's own PDF with her notes and bookmarks added as PDF
  // comments, which LiquidText shows on import. Stored, then a signed download, because a serverless
  // response tops out near 4.5 MB and court PDFs are bigger.
  if (format === "liquidtext") {
    if (!d.pdf_path) return new NextResponse("No PDF on file for this paper", { status: 404 });
    const own = d.pdf_path.startsWith(`${m.id}/`) || !m.storage_base;
    const bytes = own ? await readFile(supabase, d.pdf_path) : await fetch(`${m.storage_base}/${d.pdf_path}`).then((r) => r.arrayBuffer());
    if (!bytes) return new NextResponse("PDF unavailable", { status: 404 });
    const { data: notes } = await supabase.from("annotations").select("page_no, quote, body, tags").eq("doc_id", d.id).order("created_at");
    // notes brought in from this PDF are already inside it; adding them again would show them twice
    const ink = await readInk(m.id, d.id);
    const out = await withComments(new Uint8Array(bytes), (notes ?? []).filter((n) => !n.tags.includes("from-pdf")), ink.filter((h) => !h.tags?.includes("from-pdf")));
    const key = `${m.id}/exports/${d.id}-liquidtext.pdf`;
    const db = admin();
    if (await putFile(db, key, out, "application/pdf")) return new NextResponse("Could not prepare the PDF", { status: 500 });
    return deliver(db, key, `${name} (with notes).pdf`);
  }

  const { data: pages } = await supabase.from("document_pages").select("page_no, text").eq("doc_id", d.id).order("page_no");
  const rows = (pages ?? []).map((p) => ({ n: p.page_no, text: (p.text ?? "").trim() || "[ILLEGIBLE: no text could be read from this page]" }));
  const head = [`${m.title}`, d.source_path && d.source_path !== d.title ? `Source: ${d.source_path}` : "", `${d.page_count} pages. Verbatim text as read from the scans; the PDF is the record.`].filter(Boolean);
  const file = (body: BodyInit, type: string, ext: string) =>
    new NextResponse(body, { headers: { "content-type": type, "content-disposition": `attachment; filename="${name}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${name}.${ext}`)}` } });

  if (format === "md") return file(`# ${d.title}\n\n${head.map((h) => `_${h}_`).join("  \n")}\n\n${rows.map((r) => `## Page ${r.n}\n\n${r.text}`).join("\n\n")}\n`, "text/markdown; charset=utf-8", "md");
  if (format === "txt") return file(`${d.title}\n${head.join("\n")}\n\n${rows.map((r) => `--- Page ${r.n} ---\n${r.text}`).join("\n\n")}\n`, "text/plain; charset=utf-8", "txt");
  if (format === "docx") {
    const docx = new Document({
      title: d.title,
      sections: [{
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(d.title)] }),
          ...head.map((h) => new Paragraph({ children: [new TextRun({ text: h, italics: true })] })),
          ...rows.flatMap((r) => [
            new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: r.n > 1, children: [new TextRun(`Page ${r.n}`)] }),
            ...r.text.split("\n").map((line: string) => new Paragraph({ children: [new TextRun(line)] })),
          ]),
        ],
      }],
    });
    return file(new Uint8Array(await Packer.toBuffer(docx)), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");
  }
  return new NextResponse("Unknown format. Use pdf, liquidtext, docx, md or txt.", { status: 400 });
}

