import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'shagun',
  agentsManageApiUrl: 'http://localhost:3002',
  agentsRunApiUrl: 'http://localhost:3003',
  modelSettings: {
    base: {
      model: 'anthropic/claude-sonnet-4-20250514',
    },
    pull: {
      model: 'anthropic/claude-sonnet-4-20250514',
    },
    structuredOutput: {
      model: 'anthropic/claude-sonnet-4-20250514',
    },
    summarizer: {
      model: 'anthropic/claude-sonnet-4-20250514',
    },
  },
});
