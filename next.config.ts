import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
