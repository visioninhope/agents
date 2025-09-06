import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  outDir: 'dist',
  clean: true,
  bundle: true,
  external: ['keytar'],
  noExternal: ['@inkeep/agents-core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  outExtension() {
    return {
      js: '.js',
    };
  },
  // onSuccess:
  // 'echo "#!/usr/bin/env node" > dist/inkeep && echo "import \"./index.js\";" >> dist/inkeep && chmod +x dist/inkeep',
});
