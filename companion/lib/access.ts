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

// Small JSON state files in the private bucket (workspace arrangement, linked Telegram chats).
// Storage reads go through a CDN cache (1 hour by default), which showed an archived matter as
// still active right after archiving (2026-09-22). So: write with no caching, read fresh.
export async function readState<T>(path: string, fallback: T): Promise<T> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/companion/${path}?fresh=${Date.now()}`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! },
    cache: "no-store",
  });
  if (!r.ok) return fallback;
  try { return (await r.json()) as T; } catch { return fallback; }
}

export async function writeState(path: string, value: unknown) {
  const { error } = await admin().storage.from("companion")
    .upload(path, new Blob([JSON.stringify(value)], { type: "application/json" }), { upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Could not save: ${error.message}`);
}
