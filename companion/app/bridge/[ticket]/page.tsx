import { redirect } from "next/navigation";
import { acceptBridge } from "@/app/actions";
import Submit from "@/app/Submit";
import { admin, readState } from "@/lib/access";
import { bridgeable, known, LINKS, pathFor, type Ticket, ticketAt } from "@/lib/bridge";
import { requireUser } from "@/lib/supabase";
import { TAXONOMIES } from "@/lib/taxonomies";

export const metadata = { title: "From Arya Files" };
export const maxDuration = 300; // acceptBridge copies the files in during this request

const mb = (b: number) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;

export default async function Bridge({ params }: { params: Promise<{ ticket: string }> }) {
  const { ticket } = await params;
  const { supabase } = await requireUser();
  const t = /^[\w-]+$/.test(ticket) ? await readState<Ticket | null>(ticketAt(ticket), null) : null;
  if (!t) return <div className="stack"><h2>This link has been used</h2><p className="muted">Open the folder from Arya Files again.</p></div>;
  const [{ data: matters }, links] = await Promise.all([
    supabase.from("matters").select("id, title").order("title"),
    readState<Record<string, string>>(LINKS, {}),
  ]);
  const linked = t.folder_id ? (matters ?? []).find((m) => m.id === links[t.folder_id!]) : undefined;
  const files = t.files.filter(bridgeable);
  const left = t.files.length - files.length;
  // Already brought over and nothing new in the folder: just open the matter.
  if (linked) {
    const have = await known(linked.id);
    if (files.every((f) => have.has(pathFor(linked.id, f)))) {
      await admin().storage.from("companion").remove([ticketAt(t.id)]);
      redirect(`/m/${linked.id}/upload`);
    }
  }
  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div>
        <h2>{t.folder}</h2>
        <p className="muted">
          {files.length} file{files.length === 1 ? "" : "s"} from Arya Files{left ? `; ${left} of a kind this app cannot read stay there` : ""}.
          They are copied in and wait, unread, until you choose Read on the matter&apos;s Upload page.
        </p>
      </div>
      <form action={acceptBridge} className="card stack">
        <input type="hidden" name="ticket" value={t.id} />
        <label className="stack" style={{ gap: ".3rem" }}>
          <span>Matter</span>
          <select name="matter" defaultValue={linked?.id ?? "new"}>
            <option value="new">New matter</option>
            {(matters ?? []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        {!linked && (
          <>
            <label className="stack" style={{ gap: ".3rem" }}>
              <span>Title, if new</span>
              <input name="title" defaultValue={t.folder} />
            </label>
            <label className="stack" style={{ gap: ".3rem" }}>
              <span>Kind, if new</span>
              <select name="kind" defaultValue="arbitration">
                {Object.keys(TAXONOMIES).map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
              </select>
            </label>
          </>
        )}
        <ul className="plain subtle" style={{ margin: 0 }}>
          {files.slice(0, 12).map((f) => <li key={f.id}>{f.name} · {mb(f.size)}</li>)}
          {files.length > 12 && <li>and {files.length - 12} more</li>}
        </ul>
        <div><Submit className="btn" pending="Copying…">Bring {files.length} file{files.length === 1 ? "" : "s"} over</Submit></div>
      </form>
    </div>
  );
}
