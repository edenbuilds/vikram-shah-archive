// Sends the problem reports (lib/reports.ts) through AgentMail.
// 06-10-2026: the account is on the plan with 3 inboxes and all 3 were taken (tripyy, operations-eden, accounts-eden), so a
// dedicated inbox was refused ("Inbox limit exceeded"). accounts-eden only ever sends (no inbound mail, no inbox-specific
// webhook), so reports go out from it. Replies are pointed at Omkar's own address (reply_to) so nothing a reply carries can
// land in a shared inbox and fire the Lovable webhook, which listens on every inbox for message.received.
const API = "https://api.agentmail.to/v0";
export const REPORT_INBOX = process.env.AGENTMAIL_INBOX || "accounts-eden@agentmail.to";
export const REPORT_TO = process.env.REPORT_EMAIL || "omkar1sonawane@gmail.com";

export type Attachment = { filename: string; content_type: string; content: string; content_disposition?: "inline" | "attachment"; content_id?: string };
export type Mail = { to: string; subject: string; text: string; html: string; attachments?: Attachment[]; labels?: string[]; replyTo?: string };

export async function sendMail(m: Mail): Promise<{ id: string }> {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY is not set");
  const r = await fetch(`${API}/inboxes/${encodeURIComponent(REPORT_INBOX)}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to: [m.to], subject: m.subject, text: m.text, html: m.html, labels: m.labels, reply_to: m.replyTo ? [m.replyTo] : undefined, attachments: m.attachments }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`AgentMail ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { message_id?: string };
  return { id: j.message_id ?? "" };
}
