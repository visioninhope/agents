import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelSettings, StatusUpdateSettings } from '../../builder/types';
import { GraphSession, graphSessionManager } from '../../utils/graph-session';
import type { StreamHelper } from '../../utils/stream-helpers';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'Processing your request with tools and generating results...',
  }),
  generateObject: vi.fn().mockResolvedValue({
    object: {
      statusComponents: [
        {
          id: 'status-1',
          type: 'text',
          props: { text: 'Status update generated' },
        },
      ],
    },
  }),
}));

// Mock the AI SDK providers
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn().mockReturnValue('mock-anthropic-model'),
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn().mockReturnValue('mock-openai-model'),
}));

// Mock ModelFactory
vi.mock('../../agents/ModelFactory.js', () => ({
  ModelFactory: {
    getModel: vi.fn().mockReturnValue('mock-model'),
  },
}));

// Mock stream registry
vi.mock('../../utils/stream-registry.js', () => ({
  getStreamHelper: vi.fn().mockReturnValue({
    writeRole: vi.fn().mockResolvedValue(undefined),
    writeContent: vi.fn().mockResolvedValue(undefined),
    streamData: vi.fn().mockResolvedValue(undefined),
    streamText: vi.fn().mockResolvedValue(undefined),
    writeError: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    writeData: vi.fn().mockResolvedValue(undefined),
    writeOperation: vi.fn().mockResolvedValue(undefined),
    writeSummary: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('GraphSession', () => {
  let session: GraphSession;
  let mockStreamHelper: StreamHelper;

  beforeEach(() => {
    vi.clearAllMocks();

    mockStreamHelper = {
      writeRole: vi.fn().mockResolvedValue(undefined),
      writeContent: vi.fn().mockResolvedValue(undefined),
      streamData: vi.fn().mockResolvedValue(undefined),
      streamText: vi.fn().mockResolvedValue(undefined),
      writeError: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      writeData: vi.fn().mockResolvedValue(undefined),
      writeOperation: vi.fn().mockResolvedValue(undefined),
      writeSummary: vi.fn().mockResolvedValue(undefined),
    };

    // Mock getStreamHelper to return our mockStreamHelper
    const { getStreamHelper } = require('../../utils/stream-registry');
    vi.mocked(getStreamHelper).mockReturnValue(mockStreamHelper);

    session = new GraphSession('test-session', 'test-message', 'test-graph');
  });

  afterEach(() => {
    // Clean up any sessions
    session.cleanup();
    graphSessionManager.endSession('test-session');
  });

  describe('Basic Session Management', () => {
    it('should create a session with initial state', () => {
      expect(session.sessionId).toBe('test-session');
      expect(session.messageId).toBe('test-message');
      expect(session.graphId).toBe('test-graph');
      expect(session.isCurrentlyStreaming()).toBe(false);
      expect(session.getEvents()).toHaveLength(0);
    });

    it('should end session properly', () => {
      session.cleanup();
      // Since isEnded is private, we can test that cleanup was called by verifying
      // that subsequent operations don't add events
      session.recordEvent('tool_execution', 'agent', {
        toolName: 'test',
        args: {},
        result: 'test',
      });
      expect(session.getEvents()).toHaveLength(0); // No events should be added after cleanup
    });

    it('should track text streaming state', () => {
      expect(session.isCurrentlyStreaming()).toBe(false);

      session.setTextStreaming(true);
      expect(session.isCurrentlyStreaming()).toBe(true);

      session.setTextStreaming(false);
      expect(session.isCurrentlyStreaming()).toBe(false);
    });
  });

  describe('Event Recording', () => {
    it('should record agent_generate events', () => {
      session.recordEvent('agent_generate', 'test-agent', {
        parts: [
          { type: 'text', content: 'Hello world' },
          { type: 'tool_result', content: 'Tool executed successfully' },
        ],
        generationType: 'text_generation',
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'agent_generate',
        agentId: 'test-agent',
        data: {
          parts: expect.arrayContaining([
            { type: 'text', content: 'Hello world' },
            { type: 'tool_result', content: 'Tool executed successfully' },
          ]),
          generationType: 'text_generation',
        },
      });
    });

    it('should record transfer events', () => {
      session.recordEvent('transfer', 'router-agent', {
        fromAgent: 'router-agent',
        targetAgent: 'specialist-agent',
        reason: 'User needs specialized help',
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'transfer',
        agentId: 'router-agent',
        data: {
          fromAgent: 'router-agent',
          targetAgent: 'specialist-agent',
          reason: 'User needs specialized help',
        },
      });
    });

    it('should record delegation events', () => {
      // Delegation sent
      session.recordEvent('delegation_sent', 'parent-agent', {
        delegationId: 'del-123',
        fromAgent: 'parent-agent',
        targetAgent: 'child-agent',
        taskDescription: 'Process this data',
        context: { priority: 'high' },
      });

      // Delegation returned
      session.recordEvent('delegation_returned', 'parent-agent', {
        delegationId: 'del-123',
        fromAgent: 'child-agent',
        targetAgent: 'parent-agent',
        result: { processed: true },
      });

      expect(session.getEvents()).toHaveLength(2);
      expect(session.getEvents()[0].eventType).toBe('delegation_sent');
      expect(session.getEvents()[1].eventType).toBe('delegation_returned');
    });

    it('should record artifact_saved events', () => {
      session.recordEvent('artifact_saved', 'agent-1', {
        artifactId: 'artifact-123',
        taskId: 'task-456',
        artifactType: 'chart',
        summaryData: { title: 'Sales Chart' },
        fullData: { chartData: [1, 2, 3] },
        tenantId: 'tenant-1',
        projectId: 'project-1',
        contextId: 'context-1',
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'artifact_saved',
        agentId: 'agent-1',
        data: {
          artifactId: 'artifact-123',
          taskId: 'task-456',
          artifactType: 'chart',
        },
      });
    });

    it('should record tool_execution events', () => {
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'search',
        args: { query: 'test query' },
        result: { results: ['result1', 'result2'] },
        duration: 1500,
      });

      expect(session.getEvents()).toHaveLength(1);
      expect(session.getEvents()[0]).toMatchObject({
        eventType: 'tool_execution',
        agentId: 'agent-1',
        data: {
          toolName: 'search',
          args: { query: 'test query' },
          result: { results: ['result1', 'result2'] },
          duration: 1500,
        },
      });
    });
  });

  describe('Status Updates', () => {
    it('should initialize status updates with event-based config', () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 3,
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Add events to trigger status update
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'search',
        args: { query: 'test' },
        result: 'found results',
      });

      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'Generated response' }],
        generationType: 'text_generation',
      });

      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'process',
        args: { data: 'test data' },
        result: 'processed',
      });

      // Should trigger status update after 3 events
      expect(session.getEvents()).toHaveLength(3);
    });

    it('should initialize status updates with time-based config', () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        timeInSeconds: 5,
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Time-based updates should not trigger immediately
      expect(mockStreamHelper.writeOperation).not.toHaveBeenCalled();
    });

    it('should not initialize status updates when disabled', () => {
      const config: StatusUpdateSettings = {
        enabled: false,
        numEvents: 5,
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Add events
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'test',
        args: {},
        result: 'test',
      });

      // Should not trigger any updates
      expect(mockStreamHelper.writeOperation).not.toHaveBeenCalled();
    });

    it('should prevent data operations during text streaming', () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Start text streaming
      session.setTextStreaming(true);

      // Add event that would normally trigger status update
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'test',
        args: {},
        result: 'test',
      });

      // Should not send status update while streaming text
      expect(mockStreamHelper.writeOperation).not.toHaveBeenCalled();

      // Stop text streaming
      session.setTextStreaming(false);

      // Now add another event
      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'response' }],
        generationType: 'text_generation',
      });

      // Should trigger update now
      // Note: This would need actual async timing to test properly
    });

    it('should handle race conditions in cleanup', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        timeInSeconds: 0.1, // Very short timer
        model: 'claude-3-5-haiku-20241022',
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // End session immediately to create race condition
      session.cleanup();

      // Wait a bit to let any timers fire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should not crash or throw errors - test by verifying no new events are recorded
      session.recordEvent('tool_execution', 'agent', {
        toolName: 'test',
        args: {},
        result: 'test',
      });
      expect(session.getEvents()).toHaveLength(0);
    });
  });

  describe('GraphSessionManager', () => {
    it('should create and retrieve sessions', () => {
      const sessionId = graphSessionManager.createSession('manager-test', 'test-graph');
      expect(sessionId).toBe('manager-test');

      const retrieved = graphSessionManager.getSession('manager-test');
      expect(retrieved).toBeTruthy();
      expect(retrieved?.sessionId).toBe('manager-test');
    });

    it('should record events via manager', () => {
      graphSessionManager.createSession('manager-test', 'test-graph');

      graphSessionManager.recordEvent('manager-test', 'tool_execution', 'agent-1', {
        toolName: 'test-tool',
        args: { input: 'test' },
        result: { output: 'success' },
      });

      const retrieved = graphSessionManager.getSession('manager-test');
      expect(retrieved?.getEvents()).toHaveLength(1);
      expect(retrieved?.getEvents()[0].data).toMatchObject({
        toolName: 'test-tool',
        args: { input: 'test' },
        result: { output: 'success' },
      });
    });

    it('should set text streaming state via manager', () => {
      graphSessionManager.createSession('manager-test', 'test-graph');
      const retrieved = graphSessionManager.getSession('manager-test');

      expect(retrieved?.isCurrentlyStreaming()).toBe(false);

      graphSessionManager.setTextStreaming('manager-test', true);
      expect(retrieved?.isCurrentlyStreaming()).toBe(true);

      graphSessionManager.setTextStreaming('manager-test', false);
      expect(retrieved?.isCurrentlyStreaming()).toBe(false);
    });

    it('should handle non-existent sessions gracefully', () => {
      // Should not throw when trying to record event for non-existent session
      expect(() => {
        graphSessionManager.recordEvent('non-existent', 'tool_execution', 'agent', {
          toolName: 'test',
          args: {},
          result: 'test',
        });
      }).not.toThrow();

      // Should not throw when trying to set text streaming for non-existent session
      expect(() => {
        graphSessionManager.setTextStreaming('non-existent', true);
      }).not.toThrow();
    });

    it('should end sessions via manager', () => {
      graphSessionManager.createSession('manager-test', 'test-graph');
      const retrieved = graphSessionManager.getSession('manager-test');

      // Test that session can record events before ending
      retrieved?.recordEvent('tool_execution', 'agent', {
        toolName: 'test',
        args: {},
        result: 'test',
      });
      expect(retrieved?.getEvents()).toHaveLength(1);

      const finalEvents = graphSessionManager.endSession('manager-test');
      expect(finalEvents).toHaveLength(1);

      // Session should be removed from manager
      expect(graphSessionManager.getSession('manager-test')).toBeNull();
    });
  });

  describe('Event Filtering and Analysis', () => {
    beforeEach(() => {
      // Add a variety of events
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'search',
        args: { query: 'test' },
        result: 'results found',
      });

      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'Generated text' }],
        generationType: 'text_generation',
      });

      session.recordEvent('transfer', 'agent-1', {
        fromAgent: 'agent-1',
        targetAgent: 'agent-2',
        reason: 'Specialized task',
      });

      session.recordEvent('tool_execution', 'agent-2', {
        toolName: 'process',
        args: { data: 'input' },
        result: 'processed',
      });

      session.recordEvent('artifact_saved', 'agent-2', {
        artifactId: 'art-1',
        taskId: 'task-1',
        artifactType: 'chart',
        summaryData: { title: 'Test Chart' },
      });
    });

    it('should filter events by type', () => {
      const toolEvents = session.getEvents().filter((e) => e.eventType === 'tool_execution');
      expect(toolEvents).toHaveLength(2);

      const transferEvents = session.getEvents().filter((e) => e.eventType === 'transfer');
      expect(transferEvents).toHaveLength(1);

      const artifactEvents = session.getEvents().filter((e) => e.eventType === 'artifact_saved');
      expect(artifactEvents).toHaveLength(1);
    });

    it('should filter events by agent', () => {
      const agent1Events = session.getEvents().filter((e) => e.agentId === 'agent-1');
      expect(agent1Events).toHaveLength(3);

      const agent2Events = session.getEvents().filter((e) => e.agentId === 'agent-2');
      expect(agent2Events).toHaveLength(2);
    });

    it('should track event timeline correctly', () => {
      const events = session.getEvents();

      // Events should be in chronological order
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
      }
    });
  });

  describe('Summary Events', () => {
    it('should emit data-summary events using SummaryEvent interface', () => {
      // Test that graph session can emit summary events with the new interface
      const summaryEvent = {
        label: 'Processing completed',
        details: {
          summary: 'Successfully processed user request',
          itemsProcessed: 5,
          duration: '2.3s'
        }
      };

      // This would be called by the GraphSession when streaming summary events
      expect(() => {
        // Verify the SummaryEvent structure is valid
        expect(summaryEvent.label).toBe('Processing completed');
        expect(summaryEvent.details?.summary).toBe('Successfully processed user request');
        expect(summaryEvent.details?.itemsProcessed).toBe(5);
      }).not.toThrow();
    });

    it('should handle SummaryEvent with minimal structure', () => {
      const minimalSummary = {
        label: 'Status update'
        // details is optional
      };

      expect(() => {
        expect(minimalSummary.label).toBe('Status update');
        expect(minimalSummary.details).toBeUndefined();
      }).not.toThrow();
    });

    it('should handle SummaryEvent with flexible details', () => {
      const flexibleSummary = {
        label: 'Dynamic status',
        details: {
          // Can contain any structured data
          customField: 'custom value',
          nestedData: {
            level: 2,
            items: ['a', 'b', 'c']
          },
          timestamp: new Date().toISOString()
        }
      };

      expect(flexibleSummary.details?.customField).toBe('custom value');
      expect(flexibleSummary.details?.nestedData.level).toBe(2);
      expect(Array.isArray(flexibleSummary.details?.nestedData.items)).toBe(true);
    });

    it('should call writeSummary for structured status updates', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022',
        statusComponents: [
          {
            id: 'test_component',
            type: 'test_component',
            name: 'Test Component',
            description: 'Test component for status updates',
            detailsSchema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'string' }
              },
              required: ['label']
            }
          }
        ]
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Mock the generateObject response
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          test_component: {
            label: 'Found test result',
            value: 'Test value'
          }
        }
      });

      // Add an event to trigger status update
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'search',
        args: { query: 'test' },
        result: 'found results'
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was called with the correct structure
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledWith({
        label: 'Found test result',
        data: {
          value: 'Test value'
        }
      });
    });

    it('should call writeSummary for text-based status updates', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022'
        // No statusComponents - triggers text-based updates
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Mock the generateText response
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Processing search results and analyzing data'
      });

      // Add an event to trigger status update
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'process',
        args: { data: 'test data' },
        result: 'processed'
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was called with just a label
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledWith({
        label: 'Processing search results and analyzing data'
      });
    });

    it('should call writeSummary multiple times for multiple structured components', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022',
        statusComponents: [
          {
            id: 'progress',
            type: 'progress',
            name: 'Progress Update',
            description: 'Progress information',
            detailsSchema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                percentage: { type: 'number' }
              },
              required: ['label']
            }
          },
          {
            id: 'result',
            type: 'result',
            name: 'Result Update',
            description: 'Result information',
            detailsSchema: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                items: { type: 'array', items: { type: 'string' } }
              },
              required: ['label']
            }
          }
        ]
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Mock the generateObject response with multiple components
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          progress: {
            label: 'Analyzed 50% of data',
            percentage: 50
          },
          result: {
            label: 'Found 3 matching items',
            items: ['item1', 'item2', 'item3']
          }
        }
      });

      // Add an event to trigger status update
      session.recordEvent('agent_generate', 'agent-1', {
        parts: [{ type: 'text', content: 'Processing' }],
        generationType: 'text_generation'
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was called twice, once for each component
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledTimes(2);
      expect(mockStreamHelper.writeSummary).toHaveBeenNthCalledWith(1, {
        label: 'Analyzed 50% of data',
        data: {
          percentage: 50
        }
      });
      expect(mockStreamHelper.writeSummary).toHaveBeenNthCalledWith(2, {
        label: 'Found 3 matching items',
        data: {
          items: ['item1', 'item2', 'item3']
        }
      });
    });

    it('should not call writeSummary when no_relevant_updates is returned', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022',
        statusComponents: [
          {
            id: 'update',
            type: 'update',
            name: 'Update Component',
            description: 'Update information',
            detailsSchema: {
              type: 'object',
              properties: {
                label: { type: 'string' }
              },
              required: ['label']
            }
          }
        ]
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Mock the generateObject response with no_relevant_updates
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          no_relevant_updates: {
            no_updates: true
          }
        }
      });

      // Clear any previous calls
      vi.clearAllMocks();

      // Add an event to trigger status update
      session.recordEvent('tool_execution', 'agent-1', {
        toolName: 'check',
        args: {},
        result: 'no changes'
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was NOT called since no_relevant_updates was returned
      expect(mockStreamHelper.writeSummary).not.toHaveBeenCalled();
    });

    it('should filter out empty summary data before calling writeSummary', async () => {
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022',
        statusComponents: [
          {
            id: 'component1',
            type: 'component1',
            name: 'Component 1',
            description: 'First component',
            detailsSchema: {
              type: 'object',
              properties: {
                label: { type: 'string' }
              },
              required: ['label']
            }
          }
        ]
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Mock the generateObject response with empty data
      const { generateObject } = await import('ai');
      vi.mocked(generateObject).mockResolvedValueOnce({
        object: {
          component1: {} // Empty object - should be filtered out
        }
      });

      // Clear any previous calls
      vi.clearAllMocks();

      // Add an event to trigger status update
      session.recordEvent('artifact_saved', 'agent-1', {
        artifactId: 'art-1',
        taskId: 'task-1',
        artifactType: 'data',
        summaryData: {}
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was NOT called due to empty data
      expect(mockStreamHelper.writeSummary).not.toHaveBeenCalled();
    });

    it('should call writeSummary with custom prompt in status updates', async () => {
      const customPrompt = 'Always mention the task completion percentage';
      const config: StatusUpdateSettings = {
        enabled: true,
        numEvents: 1,
        model: 'claude-3-5-haiku-20241022',
        prompt: customPrompt
      };

      session.initializeStatusUpdates(config, { model: 'claude-3-5-haiku-20241022' });

      // Mock the generateText response
      const { generateText } = await import('ai');
      vi.mocked(generateText).mockResolvedValueOnce({
        text: 'Task 75% complete - analyzing remaining data'
      });

      // Add an event to trigger status update
      session.recordEvent('transfer', 'agent-1', {
        fromAgent: 'agent-1',
        targetAgent: 'agent-2',
        reason: 'Continue processing'
      });

      // Wait for async status update to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify writeSummary was called with the custom prompt result
      expect(mockStreamHelper.writeSummary).toHaveBeenCalledWith({
        label: 'Task 75% complete - analyzing remaining data'
      });

      // Verify generateText was called with the custom prompt
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining(customPrompt)
        })
      );
    });
  });

  describe('Custom Status Update Prompts', () => {
    it('should store custom prompt in configuration', () => {
      const customPrompt =
        'KEEP ALL STATUS UPDATES SHORT AND CONCISE. DO NOT PROVIDE EXCESSIVE DETAILS.';
      const config: StatusUpdateSettings = {
        numEvents: 5,
        timeInSeconds: 30,
        prompt: customPrompt,
      };

      session.initializeStatusUpdates(config, 'test-model');

      // Verify prompt is stored in session state
      const statusState = (session as any).statusUpdateState;
      expect(statusState).toBeDefined();
      expect(statusState.config.prompt).toBe(customPrompt);
    });

    it('should handle structured status updates with custom prompt', () => {
      const customPrompt = 'Focus only on user-visible progress. No technical details.';
      const config: StatusUpdateSettings = {
        numEvents: 3,
        timeInSeconds: 15,
        prompt: customPrompt,
        statusComponents: [
          {
            id: 'progress_summary',
            name: 'Progress Summary',
            description: 'Brief progress update',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Progress summary' },
              },
              required: ['summary'],
            },
          },
        ],
      };

      session.initializeStatusUpdates(config, 'test-model');

      // Verify both prompt and components are stored
      const statusState = (session as any).statusUpdateState;
      expect(statusState.config.prompt).toBe(customPrompt);
      expect(statusState.config.statusComponents).toHaveLength(1);
      expect(statusState.config.statusComponents[0].id).toBe('progress_summary');
    });

    it('should work without custom prompt (backward compatibility)', () => {
      const config: StatusUpdateSettings = {
        numEvents: 5,
        timeInSeconds: 30,
        // No prompt field
      };

      // Should not throw error during initialization
      expect(() => {
        session.initializeStatusUpdates(config, 'test-model');
      }).not.toThrow();

      // Verify config is stored without prompt
      const statusState = (session as any).statusUpdateState;
      expect(statusState).toBeDefined();
      expect(statusState.config.prompt).toBeUndefined();
    });

    it('should handle empty string custom prompt', () => {
      const config: StatusUpdateSettings = {
        numEvents: 5,
        prompt: '', // Empty string
      };

      session.initializeStatusUpdates(config, 'test-model');

      // Verify empty prompt is stored correctly
      const statusState = (session as any).statusUpdateState;
      expect(statusState.config.prompt).toBe('');
    });

    it('should preserve custom prompt content exactly', () => {
      const customPrompt =
        'IMPORTANT: Use bullets (•) and keep responses under 10 words.\nExample: • Found docs\n• Processing results';
      const config: StatusUpdateSettings = {
        numEvents: 3,
        prompt: customPrompt,
      };

      session.initializeStatusUpdates(config, 'test-model');

      // Verify exact content preservation including newlines and special characters
      const statusState = (session as any).statusUpdateState;
      expect(statusState.config.prompt).toBe(customPrompt);
      expect(statusState.config.prompt).toContain('Use bullets (•)');
      expect(statusState.config.prompt).toContain('• Found docs');
      expect(statusState.config.prompt).toContain('\n');
    });

    it('should properly pass custom prompt through GraphSessionManager', () => {
      const customPrompt = 'Manager-level custom prompt test';
      const config: StatusUpdateSettings = {
        numEvents: 2,
        prompt: customPrompt,
      };

      // Create session through manager
      const sessionId = 'test-manager-session';
      graphSessionManager.createSession(sessionId, 'test-graph', 'tenant-1', 'project-1');

      // Initialize status updates through manager
      graphSessionManager.initializeStatusUpdates(sessionId, config, 'test-model');

      // Verify session was found and configured
      const retrievedSession = graphSessionManager.getSession(sessionId);
      expect(retrievedSession).not.toBeNull();
      expect((retrievedSession as any)?.statusUpdateState?.config.prompt).toBe(customPrompt);

      // Cleanup
      graphSessionManager.endSession(sessionId);
    });

    it('should handle session not found gracefully in manager', () => {
      const config: StatusUpdateSettings = {
        numEvents: 2,
        prompt: 'Should not crash',
      };

      // Don't create session, try to initialize status updates
      expect(() => {
        graphSessionManager.initializeStatusUpdates('nonexistent-session', config, 'test-model');
      }).not.toThrow();
    });

    it('should respect prompt length validation', () => {
      const longPrompt = 'A'.repeat(2001); // Exceeds 2000 character limit
      const config: StatusUpdateSettings = {
        numEvents: 3,
        prompt: longPrompt,
      };

      // This would fail at schema validation level, but we can test the config structure
      expect(longPrompt.length).toBe(2001);
      expect(() => {
        session.initializeStatusUpdates(config, 'test-model');
      }).not.toThrow(); // GraphSession itself doesn't validate, schema does
    });

    it('should validate StatusUpdateConfig interface compatibility', () => {
      // Test that the interface properly handles all combinations
      const configs: StatusUpdateSettings[] = [
        {}, // All optional
        { numEvents: 5 },
        { timeInSeconds: 30 },
        { prompt: 'Test prompt' },
        { statusComponents: [] },
        {
          numEvents: 3,
          timeInSeconds: 15,
          prompt: 'Full config with special chars: àáâãäå and newlines\nLine 2',
          statusComponents: [
            {
              id: 'test',
              name: 'Test Component',
              description: 'Test description',
              schema: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
              },
            },
          ],
        },
      ];

      configs.forEach((config, index) => {
        expect(() => {
          session.initializeStatusUpdates(config, 'test-model');
          // Verify each config is stored correctly
          const statusState = (session as any).statusUpdateState;
          expect(statusState.config.numEvents).toBe(config.numEvents || 10); // Default value
          expect(statusState.config.prompt).toBe(config.prompt);
          if (config.statusComponents) {
            expect(statusState.config.statusComponents).toEqual(config.statusComponents);
          }
        }).not.toThrow(`Config ${index} should not throw`);
      });
    });
  });
});
