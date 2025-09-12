import { defineConfig } from 'tsup';

export default defineConfig({
  watch: process.env.MODE === 'watch',
  entry: {
    index: 'src/index.ts',
    config: 'src/config.ts',
    exports: 'src/exports.ts',
    'commands/create': 'src/commands/create.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: process.env.MODE !== 'watch',
  bundle: true,
  // Minimal external list - just problematic packages
  external: [
    'keytar', // Native module - MUST be external
  ],
  // Bundle workspace packages
  noExternal: ['@inkeep/agents-core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  outDir: 'dist',
  shims: true,
  splitting: false,
});
