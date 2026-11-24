import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tes memakai database Postgres sungguhan (lihat src/testing.ts); jalankan berurutan.
    fileParallelism: false,
    hookTimeout: 60_000,
  },
});
