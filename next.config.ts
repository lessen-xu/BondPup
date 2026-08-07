import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["192.168.3.8", "*.local"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
