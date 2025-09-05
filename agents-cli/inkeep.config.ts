import { defineConfig } from '@inkeep/agents-cli';

export default defineConfig({
  tenantId: 'inkeep',
  projectId: 'default',
  executionApiUrl: 'http://localhost:3003',
  managementApiUrl: 'http://localhost:3002',
});
