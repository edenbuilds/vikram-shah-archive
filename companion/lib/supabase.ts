import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// Every query runs as the signed-in advocate, so RLS (matter membership) decides what is visible.
export async function db() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components can't set cookies; middleware refreshes the session instead.
        }
      },
    },
  });
}

// One auth check per request: the header, the matter layout and the page all ask for the user,
// and each getUser is a network round trip to Supabase.
export const currentUser = cache(async () => {
  const supabase = await db();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

export async function requireUser() {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
