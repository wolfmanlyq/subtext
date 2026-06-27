import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;

// Enables Cloudflare bindings/env access during local `next dev` only.
// Guarded to development so production `next build` doesn't spin up miniflare.
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}
