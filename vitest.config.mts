import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Her test dosyası bellekte kendi gömülü PostgreSQL'ini açar; açılış ve sınama verisi birkaç saniye sürer.
    testTimeout: 30_000,
    hookTimeout: 90_000,
    // Testler gerçek veritabanına dokunmaz.
    env: { YANKI_PG_DIR: ":memory:", YANKI_SEED_FIXTURE: "1" },
  },
});
