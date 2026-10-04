import { linkedChats, say } from "@/lib/telegram";

// The sign-in email, in the same design language as the app and the "papers ready" mails (worker/notify.py page()):
// warm cream canvas, white card with a hairline and a violet top rule, 4px corners, serif title, violet button.
export async function sendSignInLink(email: string, link: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#faf9f6;padding:32px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dedbd6;border-radius:4px;border-top:3px solid #0007cb">
<tr><td style="padding:28px 32px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:34px;height:34px;border-radius:17px;background:#0007cb;color:#faf9f6;text-align:center;font-family:Georgia,serif;font-size:12px">CC</td>
<td style="padding-left:10px;font-family:Georgia,serif;font-size:15px;color:#111111">Case Companion</td></tr></table></td></tr>
<tr><td style="padding:14px 32px 0"><h1 style="margin:0;font-family:Georgia,serif;font-weight:400;letter-spacing:-.02em;font-size:26px;color:#111111">Your sign-in link</h1>
<p style="margin:10px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#585858">One click and you're in. No password. Bookmark it to skip this step next time.</p></td></tr>
<tr><td style="padding:22px 32px 28px"><a href="${link}" style="display:inline-block;background:#0007cb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px;font-family:Helvetica,Arial,sans-serif;font-size:15px">Open my workspace</a></td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #dedbd6;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#888888">This link opens your private workspace. Don't forward it. If you didn't ask for it, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
  const sends: Promise<unknown>[] = [];
  if (process.env.RESEND_API_KEY) {
    sends.push(fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: "Case Companion <companion@edenbuilds.me>", to: [email], subject: "Your Case Companion sign-in link", html }),
    }));
  }
  for (const [chat, e] of Object.entries(await linkedChats())) {
    if (e === email) sends.push(say(chat, `Your sign-in link (no password):\n${link}`));
  }
  await Promise.allSettled(sends);
}
