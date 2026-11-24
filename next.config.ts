import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Veritabanı sürücüleri paketlenmez; Node tarafından olduğu gibi yüklenir (PGlite WASM dosyaları için gerekir).
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
