import { defineConfig } from 'eslint/config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'contracts/casino/defender/**',
      'contracts/casino/lib/**', // vendored Foundry deps (git-ignored OpenZeppelin tree)
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // Tests: `any` is fine when stubbing/mocking — don't let it drown real signal.
    files: ['**/__tests__/**', '**/*.test.*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Ad-hoc operator scripts: CommonJS + loose typing are acceptable here.
    files: ['scripts/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
