import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Testler gerçek veritabanı dosyasına dokunmaz.
    env: { YANKI_PG_DIR: ":memory:", YANKI_SEED_FIXTURE: "1" },
  },
});
