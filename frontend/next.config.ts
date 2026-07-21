import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "10.6.18.76"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:50177/api/:path*" }];
  },
};

export default nextConfig;
