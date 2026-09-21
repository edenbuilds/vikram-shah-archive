import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Personal access tokens: one secret per user that (a) signs them in without a password and
// (b) authorises their MCP connection. token = base64url(email) + "." + HMAC(secret, email).
// Stateless on purpose: rotating COMPANION_LINK_SECRET revokes every link and connection at once.
const secret = () => {
  const s = process.env.COMPANION_LINK_SECRET;
  if (!s) throw new Error("COMPANION_LINK_SECRET is not set");
  return s;
};
const sign = (email: string) => createHmac("sha256", secret()).update(`v1:${email}`).digest("base64url");

export function tokenFor(email: string): string {
  const e = email.trim().toLowerCase();
  return `${Buffer.from(e).toString("base64url")}.${sign(e)}`;
}

export function emailFrom(token: string | null | undefined): string | null {
  const [a, b] = (token ?? "").split(".");
  if (!a || !b) return null;
  const email = Buffer.from(a, "base64url").toString();
  const want = Buffer.from(sign(email));
  const got = Buffer.from(b);
  return want.length === got.length && timingSafeEqual(want, got) ? email : null;
}

let cached: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  cached ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  return cached;
}

// The service role bypasses RLS, so every service-role read is scoped to these matter ids.
export async function memberMatters(email: string): Promise<string[]> {
  const db = admin();
  const { data: staff } = await db.from("app_users").select("email").eq("email", email).maybeSingle();
  if (!staff) return [];
  const { data } = await db.from("matter_members").select("matter_id").eq("email", email);
  return (data ?? []).map((r) => r.matter_id);
}
