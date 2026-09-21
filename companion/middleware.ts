import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  // Token-authorised routes (personal sign-in links, the MCP server, the skill file) skip the
  // session check entirely, so MCP calls don't pay for a Supabase round trip.
  const p0 = req.nextUrl.pathname;
  if (p0.startsWith("/k/") || p0.startsWith("/api/mcp/") || p0.startsWith("/skill/")) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getUser();
  const isLogin = req.nextUrl.pathname === "/login";
  const path = req.nextUrl.pathname;
  const isLanding = path === "/"; // signed-out visitors get the landing page
  // Token-authorised routes: personal sign-in links, the MCP server, the public skill file.
  if (!data.user && !isLogin && !isLanding) return NextResponse.redirect(new URL("/login", req.url));
  if (data.user && isLogin) return NextResponse.redirect(new URL("/", req.url));
  return res;
}

export const config = {
  matcher: ["/((?!_next/|favicon.svg).*)"],
};
