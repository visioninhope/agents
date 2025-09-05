import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'clishk9y40005uwzn9lpvdkrz',
  apiUrl: 'http://localhost:3002',
  modelSettings: {
    model: 'anthropic/claude-sonnet-4-20250514',
    providerOptions: {
      // API key should be set via ANTHROPIC_API_KEY environment variable
    },
  },
});
