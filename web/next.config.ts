import type { NextConfig } from "next";

// Default to nginx (8080) when using `docker compose`; falls back to Django (8000).
const apiProxyTarget = process.env.API_PROXY_TARGET || "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  output: "standalone",
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/api/:path+/",
        destination: `${apiProxyTarget}/api/:path+/`,
      },
      {
        source: "/api/:path+",
        destination: `${apiProxyTarget}/api/:path+/`,
      },
    ];
  },
};

export default nextConfig;
