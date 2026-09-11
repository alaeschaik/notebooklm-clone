import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Bundles the server and only the dependencies it actually imports into
   * .next/standalone, so the runtime image can skip node_modules entirely.
   * That is the difference between a ~200 MB image and a ~1 GB one.
   */
  output: "standalone",
};

export default nextConfig;
