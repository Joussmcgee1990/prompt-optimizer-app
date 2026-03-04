import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://www.vyzn.ai https://vyzn.ai https://vyzn-ai.design.webflow.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
