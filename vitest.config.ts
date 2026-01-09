import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Include test files
    include: ['**/*.test.ts', '**/*.spec.ts'],
    
    // Exclude
    exclude: ['node_modules', '.next', 'contracts'],
    
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/starforge/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts'],
    },
    
    // Global test timeout (10 seconds)
    testTimeout: 10000,
    
    // Reporter
    reporters: ['verbose'],
  },
  
  // Path aliases to match tsconfig
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
