import type { NextConfig } from "next";

const config: NextConfig = {
  // Page scans come straight from the archive's public bucket; no binaries are copied.
  images: { unoptimized: true },
  // The drafting pack is read from disk by the MCP route (lib/drafting.ts).
  outputFileTracingIncludes: { "/api/mcp/[token]": ["./drafting/**/*"] },
};

export default config;
