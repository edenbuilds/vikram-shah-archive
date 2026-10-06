import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Newsreader } from "next/font/google";
import localFont from "next/font/local";
import Toaster from "@/components/Toast";
import JobWatcher from "@/components/JobWatcher";
import Touch from "@/components/Touch";
import Report from "@/components/Report";
import { A11Y_BOOT } from "@/components/A11yPrefs";
import { signOut } from "./actions";
import TopNav from "@/components/TopNav";
import { currentUser } from "@/lib/supabase";
import "./globals.css";

// DESIGN.md (04-10-2026): Newsreader, the app's original serif, carries the voice (headings, paper titles); Switzer, Gleap's UI face,
// carries everything else. Switzer is self-hosted from Fontshare (ITF Free Font License, app/fonts/README.txt).
const serif = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--serif-font" });
const sans = localFont({ variable: "--sans-font", display: "swap", src: [
  { path: "./fonts/Switzer-400.woff2", weight: "400" }, { path: "./fonts/Switzer-500.woff2", weight: "500" }, { path: "./fonts/Switzer-600.woff2", weight: "600" },
] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--mono-font" });

// 04-10-2026: Omkar asked for the SEO and social details. The icons (app/icon.svg, apple-icon, pwa/), the manifest, the link
// preview image (opengraph-image, twitter-image) and robots.txt are file conventions beside this file. Every page stays noindex:
// these are private case papers, so the work here is how a shared link looks, not being found.
const DESCRIPTION = "A private workspace for an advocate's case papers: search, read, ask and keep notes, with every answer tied to its page. Not a legal opinion.";
export const metadata: Metadata = {
  metadataBase: new URL("https://case-companion.edenbuilds.me"),
  applicationName: "Case Companion",
  title: { default: "Case Companion", template: "%s · Case Companion" },
  description: DESCRIPTION,
  authors: [{ name: "Eden Builds", url: "https://edenbuilds.me" }],
  openGraph: { type: "website", siteName: "Case Companion", title: "Case Companion", description: DESCRIPTION, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "Case Companion", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "Case Companion", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

// light, always: no dark theme ships, and the browser must not invert her papers
export const viewport: Viewport = { colorScheme: "light", themeColor: "#faf9f6" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await currentUser();
  const data = { user };
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: A11Y_BOOT }} /></head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {data.user && <TopNav email={data.user.email ?? ""} signOut={signOut} />}{/* signed out, the entry page carries its own brand */}
        <div id="main">{children}</div>
        <Toaster />
        {data.user && <JobWatcher />}
        {data.user && <Touch />}
        {data.user && <Report />}
      </body>
    </html>
  );
}
