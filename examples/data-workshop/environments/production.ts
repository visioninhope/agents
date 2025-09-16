import { CredentialStoreType } from '@inkeep/agents-core';
import { registerEnvironmentSettings } from '@inkeep/agents-sdk';

export const production = registerEnvironmentSettings({
  credentials: {
    'inkeep-api-credential': {
      id: 'inkeep-api-credential',
      type: CredentialStoreType.memory,
      credentialStoreId: 'memory-default',
      retrievalParams: {
        key: 'INKEEP_API_KEY_PROD',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
});
