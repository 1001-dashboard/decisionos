import type { NextConfig } from "next";

const config: NextConfig = {
  basePath: "/decisionos",
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/", destination: "/decisionos", basePath: false, permanent: false }];
  },
};
export default config;
