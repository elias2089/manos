import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    // The integration tests share one database, so files cannot run in parallel
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/test/**'],
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
