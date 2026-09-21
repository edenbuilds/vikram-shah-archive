import { NextResponse } from "next/server";
import { admin, emailFrom } from "@/lib/access";
import { db } from "@/lib/supabase";

// Personal sign-in link: no password. The token is verified, then a normal Supabase session
// is minted for that user (magic-link token, verified server-side, never emailed).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const email = emailFrom(token);
  const home = new URL("/", req.url);
  if (!email) return NextResponse.redirect(new URL("/login?e=This sign-in link is not valid.", req.url));
  const { data: staff } = await admin().from("app_users").select("email").eq("email", email).maybeSingle();
  if (!staff) return NextResponse.redirect(new URL("/login?e=This workspace has no access for that account.", req.url));
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) return NextResponse.redirect(new URL("/login?e=Could not sign in. Try again.", req.url));
  const supabase = await db();
  const { error: vErr } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  if (vErr) return NextResponse.redirect(new URL(`/login?e=${encodeURIComponent(vErr.message)}`, req.url));
  return NextResponse.redirect(home);
}
