import { ImageResponse } from "next/og";
import Logo from "@/components/Logo";

// The install icons the manifest points at. Full-bleed violet with the mark well inside the middle 80%,
// so one image serves as both the plain and the maskable icon.
export const dynamic = "force-static";
export const generateStaticParams = () => [{ size: "192" }, { size: "512" }];
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const n = Number((await params).size);
  if (n !== 192 && n !== 512) return new Response("Not found", { status: 404 });
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#0007cb" }}><Logo size={n} box={false} ink="#faf9f6" /></div>, { width: n, height: n });
}
