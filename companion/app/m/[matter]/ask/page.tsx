import { redirect } from "next/navigation";

// Ask moved to one place for all matters (/ask); old links keep working.
export default async function OldAsk({ params, searchParams }: { params: Promise<{ matter: string }>; searchParams: Promise<{ t?: string; q?: string }> }) {
  const { matter } = await params;
  const { t, q } = await searchParams;
  redirect(t ? `/ask?t=${t}` : `/ask?m=${matter}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
}
