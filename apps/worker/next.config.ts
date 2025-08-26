import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true, // อนุญาต import ออกจากโฟลเดอร์แอป (ไปที่ libs/*)
  },
};

export default nextConfig;
