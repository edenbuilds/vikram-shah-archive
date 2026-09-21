import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { NextResponse } from "next/server";
import { getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";

// One paper, several formats. PDF: a signed storage download of the stored file itself, so the
// bytes are exactly the file on record (and big files never pass through a serverless response).
// Word / Markdown / text: generated from the verbatim page text, one section per page.
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "paper";

export async function GET(_: Request, { params }: { params: Promise<{ matter: string; doc: string; format: string }> }) {
  const { matter, doc, format } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  const { data: d } = await supabase.from("documents").select("id, title, pdf_path, source_path, page_count").eq("id", doc).eq("matter_id", m.id).maybeSingle();
  if (!d) return new NextResponse("Not found", { status: 404 });
  const name = safe(d.title);

  if (format === "pdf") {
    if (!d.pdf_path) return new NextResponse("No PDF on file for this paper", { status: 404 });
    if (d.pdf_path.startsWith(`${m.id}/`) || !m.storage_base) {
      const { data, error } = await supabase.storage.from("companion").createSignedUrl(d.pdf_path, 600, { download: `${name}.pdf` });
      if (error || !data) return new NextResponse("PDF unavailable", { status: 404 });
      return NextResponse.redirect(data.signedUrl);
    }
    return NextResponse.redirect(`${m.storage_base}/${d.pdf_path}?download=${encodeURIComponent(`${name}.pdf`)}`);
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
  return new NextResponse("Unknown format. Use pdf, docx, md or txt.", { status: 400 });
}
