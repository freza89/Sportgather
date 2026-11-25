import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC dibutuhkan agar decorator metadata NestJS ikut ter-emit saat tes.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { environment: 'node' },
});
