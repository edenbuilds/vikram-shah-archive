import type { MetadataRoute } from "next";

// Private papers: nothing is indexed (every page also carries noindex). Only the sign-in page is left open,
// because link previews (Slack reads robots.txt) need to fetch it. No sitemap on purpose.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/$", disallow: ["/m/", "/api/", "/k/", "/settings", "/ask", "/board", "/pins", "/search", "/connect"] } };
}
