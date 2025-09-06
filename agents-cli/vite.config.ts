import { resolve } from 'path';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'InkeepCLI',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['keytar'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['keytar'],
  },
});
