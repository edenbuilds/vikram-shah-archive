import type { Metadata } from "next";
import { IBM_Plex_Mono, Newsreader, Source_Sans_3 } from "next/font/google";
import { signOut } from "./actions";
import AskButton from "./AskButton";
import { LogOut, Settings2, Search, Bookmark } from "lucide-react";
import { currentUser } from "@/lib/supabase";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"], variable: "--serif-font" });
const sans = Source_Sans_3({ subsets: ["latin"], variable: "--sans-font" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--mono-font" });

export const metadata: Metadata = {
  title: "Case Companion",
  description: "The advocate's private study companion. Clerk infrastructure, not a legal opinion.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await currentUser();
  const data = { user };
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <header className="top">
          <a href="/" className="brand">
            <span className="brand-mark" aria-hidden>CC</span>
            <span>
              <b>Case Companion</b>
            </span>
          </a>
          {data.user ? (
            <div className="row" style={{ flex: "0 0 auto", gap: "1rem", alignItems: "center" }}>
              <AskButton />
              <a href="/search" className="navlink" aria-label="Search"><Search size={16} strokeWidth={1.75} aria-hidden /> <span>Search</span></a>
              <a href="/pins" className="navlink" aria-label="Pinned"><Bookmark size={16} strokeWidth={1.75} aria-hidden /> <span>Pinned</span></a>
              <a href="/settings" className="navlink" aria-label="Settings" style={{ flex: "0 0 auto" }}><Settings2 size={16} strokeWidth={1.75} aria-hidden /> <span>Settings</span></a>
              <form action={signOut} style={{ flex: "0 0 auto" }}>
                <button className="link navlink" aria-label="Sign out"><LogOut size={16} strokeWidth={1.75} aria-hidden /> <span>Sign out</span></button>
              </form>
            </div>
          ) : (
            <a href="/login" className="btn small ghost">Sign in</a>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
