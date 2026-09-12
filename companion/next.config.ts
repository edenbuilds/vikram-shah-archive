import type { NextConfig } from "next";

const config: NextConfig = {
  // Page scans come straight from the archive's public bucket; no binaries are copied.
  images: { unoptimized: true },
};

export default config;
