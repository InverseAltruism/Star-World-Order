import { defineConfig } from 'vitest/config';
import path from 'path';

const sharedAlias = {
  '@': path.resolve(__dirname, './'),
};

export default defineConfig({
  resolve: {
    alias: sharedAlias,
  },
  test: {
    environment: 'node',
    // `tests/e2e/**` is the Playwright surface (see
    // `.github/workflows/casino-e2e.yml`); vitest must not try to load
    // those specs because they import `@playwright/test`.
    exclude: ['node_modules', '.next', 'contracts', 'tests/e2e/**'],
    testTimeout: 10000,
    reporters: ['verbose'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/starforge/**/*.ts', 'lib/casino/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
    },

    // Vitest projects: each entry defines a named sub-suite. CI can target
    // a single project with `vitest run --project <name>`, e.g. `casino`.
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'default',
          environment: 'node',
          include: [
            '**/*.test.ts',
            '**/*.spec.ts',
            // `.tsx` is opt-in per-suite via the `@vitest-environment` header
            // (happy-dom for component tests). The default project still
            // defaults to `node` — only the suites that need DOM ask for it.
            'components/sanctuary/**/*.test.tsx',
            'components/sanctuary/**/*.spec.tsx',
          ],
          exclude: [
            'node_modules',
            '.next',
            'contracts',
            'lib/casino/**',
            'components/casino/**',
            'app/casino/**',
            'tests/e2e/**',
          ],
        },
      },
      {
        resolve: { alias: sharedAlias },
        test: {
          name: 'casino',
          environment: 'node',
          include: [
            'lib/casino/**/*.test.ts',
            'lib/casino/**/*.spec.ts',
            'lib/casino/**/*.test.tsx',
            'lib/casino/**/*.spec.tsx',
            'components/casino/**/*.test.ts',
            'components/casino/**/*.spec.ts',
            'components/casino/**/*.test.tsx',
            'components/casino/**/*.spec.tsx',
            'app/casino/**/*.test.ts',
            'app/casino/**/*.spec.ts',
            'app/casino/**/*.test.tsx',
            'app/casino/**/*.spec.tsx',
          ],
          exclude: ['node_modules', '.next', 'contracts', 'tests/e2e/**'],
        },
      },
    ],
  },
});
