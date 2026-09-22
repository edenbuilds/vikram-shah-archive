import { getMatter } from "@/lib/data";
import { requireUser } from "@/lib/supabase";
import EditDialog from "@/components/EditDialog";
import { updateMatter } from "@/app/actions";
import Tabs from "./Tabs";

export default async function MatterLayout({ children, params }: { children: React.ReactNode; params: Promise<{ matter: string }> }) {
  const { matter } = await params;
  const { supabase } = await requireUser();
  const m = await getMatter(supabase, matter);
  return (
    <>
      <div className="matter-head">
        <div className="wrap">
          <p className="crumbs"><a href="/">Workspace</a> / {m.short ?? m.title}</p>
          <p className="kicker">{[m.kind, m.cause].filter(Boolean).join(" · ")}</p>
          <h1 style={{ marginBottom: ".15rem" }}>{m.title}</h1>
          <EditDialog action={updateMatter} hidden={{ matter: m.id }} label="Edit details" fields={[
            { name: "title", label: "Case name", value: m.title }, { name: "short", label: "Short name", value: m.short },
            { name: "forum", label: "Court or forum", value: m.forum }, { name: "cause", label: "Cause", value: m.cause }]} />
          <p className="muted" style={{ margin: 0 }}>{m.forum}{m.venue ? ` · ${m.venue}` : ""}</p>
          <Tabs base={`/m/${m.id}`} />
        </div>
      </div>
      <main className="wrap">{children}</main>
      <footer className="disclaimer">
        {m.disclaimer} Advocate&apos;s notes and editorial assists are working material, not a finding.
      </footer>
    </>
  );
}
