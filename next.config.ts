import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ProxyAgent uses Node's network stack. Keep it out of the server bundle.
  serverExternalPackages: ["undici"],
};

export default nextConfig;
