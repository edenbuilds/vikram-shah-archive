import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import Toaster from "@/components/Toast";
import { signOut } from "./actions";
import TopNav from "@/components/TopNav";
import { currentUser } from "@/lib/supabase";
import "./globals.css";

// DESIGN.md (04-10-2026): Fraunces carries the voice (headings, paper titles); Switzer, Gleap's UI face,
// carries everything else. Switzer is self-hosted from Fontshare (ITF Free Font License, app/fonts/README.txt).
const serif = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz", "SOFT"], variable: "--serif-font" });
const sans = localFont({ variable: "--sans-font", display: "swap", src: [
  { path: "./fonts/Switzer-400.woff2", weight: "400" }, { path: "./fonts/Switzer-500.woff2", weight: "500" }, { path: "./fonts/Switzer-600.woff2", weight: "600" },
] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--mono-font" });

export const metadata: Metadata = {
  title: "Case Companion",
  description: "The advocate's private study companion. Clerk infrastructure, not a legal opinion.",
  robots: { index: false, follow: false },
};

// light, always: no dark theme ships, and the browser must not invert her papers
export const viewport: Viewport = { colorScheme: "light", themeColor: "#edede8" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await currentUser();
  const data = { user };
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {data.user && <TopNav email={data.user.email ?? ""} signOut={signOut} />}{/* signed out, the entry page carries its own brand */}
        <div id="main">{children}</div>
        <Toaster />
      </body>
    </html>
  );
}
