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
    exclude: ['node_modules', '.next', 'contracts'],
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
          include: ['**/*.test.ts', '**/*.spec.ts'],
          exclude: [
            'node_modules',
            '.next',
            'contracts',
            'lib/casino/**',
            'components/casino/**',
            'app/casino/**',
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
            'components/casino/**/*.test.ts',
            'components/casino/**/*.spec.ts',
            'app/casino/**/*.test.ts',
            'app/casino/**/*.spec.ts',
          ],
          exclude: ['node_modules', '.next', 'contracts'],
        },
      },
    ],
  },
});
