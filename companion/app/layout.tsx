import type { Metadata } from "next";
import { IBM_Plex_Mono, Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import { signOut } from "./actions";
import { db } from "@/lib/supabase";
import "./globals.css";

const serif = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--serif-font" });
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--sans-font" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--mono-font" });

export const metadata: Metadata = {
  title: "Case Companion",
  description: "The advocate's private study companion. Clerk infrastructure, not a legal opinion.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { data } = await (await db()).auth.getUser();
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <a href="/" className="brand">
            <span className="brand-mark" aria-hidden>CC</span>
            <span>
              <b>Case Companion</b>
              <small>Clerk of the papers · private</small>
            </span>
          </a>
          {data.user ? (
            <form action={signOut}>
              <button className="link">Sign out</button>
            </form>
          ) : (
            <a href="/login" className="btn small ghost">Sign in</a>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
