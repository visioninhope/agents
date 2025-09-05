import { beforeEach, describe, expect, it, vi } from 'vitest';
import { A2AClient } from '../../a2a/client.js';
import { CredentialStuffer } from '@inkeep/agents-core';
import { createDelegateToAgentTool } from '../../agents/relationTools.js';
import { saveA2AMessageResponse } from '../../data/conversations.js';
import dbClient from '../../data/db/dbClient.js';
// Functions now imported from @inkeep/agents-core and mocked above
import { executionServer } from '../../index.js';

const {
  createMessageMock,
  getCredentialReferenceMock,
  createCredentialReferenceMock,
  getExternalAgentMock,
} = vi.hoisted(() => {
  const createMessageMock = vi.fn(() => vi.fn().mockResolvedValue({ id: 'msg-123' }));
  const getCredentialReferenceMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  const createCredentialReferenceMock = vi.fn(() => vi.fn().mockResolvedValue({ id: 'cred-123' }));
  const getExternalAgentMock = vi.fn(() => vi.fn().mockResolvedValue(null));
  return {
    createMessageMock,
    getCredentialReferenceMock,
    createCredentialReferenceMock,
    getExternalAgentMock,
  };
});

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    createMessage: createMessageMock,
    getCredentialReference: getCredentialReferenceMock,
    createCredentialReference: createCredentialReferenceMock,
    getExternalAgent: getExternalAgentMock,
    contextValidationMiddleware: vi.fn().mockReturnValue(async (c: any, next: any) => {
      c.set('validatedContext', {
        graphId: 'test-graph',
        tenantId: 'test-tenant',
        projectId: 'default',
      });
      await next();
    }),
    createDatabaseClient: vi.fn().mockReturnValue({}),
    CredentialStuffer: vi.fn().mockImplementation(() => ({
      stuff: vi.fn().mockResolvedValue({}),
    })),
  };
});

vi.mock('../../data/db/dbClient.js', () => ({
  default: {},
}));

vi.mock('../../a2a/client.js');
vi.mock('../../agents/CredentialStuffer.js');
vi.mock('../../data/conversations.js');

describe('External Agent Credential Handling', () => {
  const mockTenantId = 'test-tenant';
  const mockAgentId = 'external-agent-1';
  const mockGraphId = 'test-graph';
  const mockContextId = 'test-context';
  const mockProjectId = 'test-project';
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database operations
    vi.mocked(saveA2AMessageResponse).mockResolvedValue({} as any);
  });

  describe('createDelegateToAgentTool with credentials', () => {
    it('should resolve static headers for external agents', async () => {
      const mockHeaders = {
        Authorization: 'Bearer static-token',
        'X-Custom-Header': 'custom-value',
      };

      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: mockHeaders,
        credentialReferenceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      // Mock CredentialStuffer to return the static headers
      vi.mocked(CredentialStuffer).mockImplementation(
        () =>
          ({
            getCredentialHeaders: vi.fn().mockResolvedValue(mockHeaders),
            agentFramework: executionServer,
          }) as any
      );

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
          },
        },
        callingAgentId: 'caller-agent',
        tenantId: mockTenantId,
        graphId: mockGraphId,
        projectId: mockProjectId,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        agent: {
          getStreamingHelper: () => null,
        },
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await delegateTool.execute({ message: 'Test delegation' });

      // Verify CredentialStuffer was called with static headers
      const credentialStufferInstance = vi.mocked(CredentialStuffer).mock.results[0]?.value;
      expect(credentialStufferInstance?.getCredentialHeaders).toHaveBeenCalledWith({
        context: expect.objectContaining({
          tenantId: mockTenantId,
          conversationId: 'conv-123',
          contextConfigId: mockContextId,
        }),
        storeReference: undefined,
        headers: mockHeaders,
      });

      // Verify headers were passed to A2AClient
      expect(capturedHeaders).toEqual(mockHeaders);
      expect(vi.mocked(A2AClient)).toHaveBeenCalledWith(
        'https://external-agent.example.com',
        expect.objectContaining({
          headers: mockHeaders,
        })
      );
    });

    it('should resolve credential references for external agents', async () => {
      const mockCredentialReferenceId = 'cred-ref-123';
      const resolvedHeaders = {
        Authorization: 'Bearer resolved-token',
        'X-API-Key': 'resolved-api-key',
      };

      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: null,
        credentialReferenceId: mockCredentialReferenceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      // Mock getCredentialReference to return the expected credential reference
      getCredentialReferenceMock.mockReturnValue(
        vi.fn().mockResolvedValue({
          id: mockCredentialReferenceId,
          tenantId: mockTenantId,
          projectId: mockProjectId,
          type: 'test-type',
          credentialStoreId: mockCredentialReferenceId,
          retrievalParams: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );

      // Mock CredentialStuffer
      vi.mocked(CredentialStuffer).mockImplementation(
        () =>
          ({
            getCredentialHeaders: vi.fn().mockResolvedValue(resolvedHeaders),
            agentFramework: executionServer,
          }) as any
      );

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
          },
        },
        callingAgentId: 'caller-agent',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        graphId: mockGraphId,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        agent: {
          getStreamingHelper: () => null,
        },
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await delegateTool.execute({ message: 'Test delegation' });

      // Verify credential resolution was called
      const credentialStufferInstance = vi.mocked(CredentialStuffer).mock.results[0]?.value;
      expect(credentialStufferInstance?.getCredentialHeaders).toHaveBeenCalledWith({
        context: expect.objectContaining({
          tenantId: mockTenantId,
          conversationId: 'conv-123',
          contextConfigId: mockContextId,
        }),
        storeReference: expect.objectContaining({
          credentialStoreId: mockCredentialReferenceId,
          retrievalParams: {},
        }),
        headers: undefined,
      });

      // Verify resolved headers were passed to A2AClient
      expect(capturedHeaders).toEqual(resolvedHeaders);
    });

    it('should combine static headers and credential references', async () => {
      const mockStaticHeaders = {
        'X-Custom-Header': 'static-value',
      };
      const mockCredentialReferenceId = 'cred-ref-123';
      const resolvedHeaders = {
        Authorization: 'Bearer resolved-token',
        'X-Custom-Header': 'static-value', // Should preserve static headers
        'X-API-Key': 'resolved-api-key',
      };

      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: mockStaticHeaders,
        credentialReferenceId: mockCredentialReferenceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      // Mock CredentialStuffer to return combined headers
      vi.mocked(CredentialStuffer).mockImplementation(
        () =>
          ({
            getCredentialHeaders: vi.fn().mockResolvedValue(resolvedHeaders),
            agentFramework: executionServer,
          }) as any
      );

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
          },
        },
        callingAgentId: 'caller-agent',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        graphId: mockGraphId,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        agent: {
          getStreamingHelper: () => null,
        },
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await delegateTool.execute({ message: 'Test delegation' });

      // Verify both static headers and credential reference were passed
      const credentialStufferInstance = vi.mocked(CredentialStuffer).mock.results[0]?.value;
      expect(credentialStufferInstance?.getCredentialHeaders).toHaveBeenCalledWith({
        context: expect.objectContaining({
          tenantId: mockTenantId,
          conversationId: 'conv-123',
          contextConfigId: mockContextId,
        }),
        storeReference: expect.objectContaining({
          credentialStoreId: mockCredentialReferenceId,
          retrievalParams: {},
        }),
        headers: mockStaticHeaders,
      });

      // Verify combined headers were passed to A2AClient
      expect(capturedHeaders).toEqual(resolvedHeaders);
    });

    it('should handle external agents without credentials', async () => {
      const mockExternalAgent = {
        id: mockAgentId,
        tenantId: mockTenantId,
        name: 'Test External Agent',
        description: 'Test agent',
        baseUrl: 'https://external-agent.example.com',
        headers: null,
        credentialReferenceId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mock the curried function call
      getExternalAgentMock.mockReturnValue(vi.fn().mockResolvedValue(mockExternalAgent));

      const delegateTool = createDelegateToAgentTool({
        delegateConfig: {
          type: 'external',
          config: {
            id: mockAgentId,
            baseUrl: 'https://external-agent.example.com',
            name: 'Test External Agent',
            description: 'Test agent',
          },
        },
        callingAgentId: 'caller-agent',
        tenantId: mockTenantId,
        projectId: mockProjectId,
        graphId: mockGraphId,
        contextId: mockContextId,
        metadata: {
          conversationId: 'conv-123',
          threadId: 'thread-123',
        },
        agent: {
          getStreamingHelper: () => null,
        },
      });

      // Mock A2AClient constructor to capture headers
      let capturedHeaders: Record<string, string> = {};
      vi.mocked(A2AClient).mockImplementation((url: string, options?: any) => {
        capturedHeaders = options?.headers || {};
        return {
          sendMessage: vi.fn().mockResolvedValue({
            result: { message: 'Success' },
          }),
        } as any;
      });

      // Execute the delegation
      await delegateTool.execute({ message: 'Test delegation' });

      // Verify no headers were passed to A2AClient
      expect(capturedHeaders).toEqual({});
      expect(vi.mocked(CredentialStuffer)).not.toHaveBeenCalled();
    });
  });

  describe('A2AClient with headers', () => {
    it('should pass headers to constructor options', () => {
      const mockHeaders = {
        Authorization: 'Bearer test-token',
        'X-Custom-Header': 'custom-value',
      };

      // Since A2AClient is mocked, we just verify it's called with correct options
      const client = new A2AClient('https://external-agent.example.com', {
        headers: mockHeaders,
      });

      expect(A2AClient).toHaveBeenCalledWith(
        'https://external-agent.example.com',
        expect.objectContaining({
          headers: mockHeaders,
        })
      );
    });
  });
});
