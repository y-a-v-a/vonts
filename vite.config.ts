import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any sub-path (e.g. GitHub Pages project sites).
  base: './',
  build: { target: 'es2022', sourcemap: true },
  optimizeDeps: { include: ['clipper-lib', 'opentype.js'] },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
