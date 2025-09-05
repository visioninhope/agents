import { agent, agentGraph, tool } from '@inkeep/agents-sdk';

// Define tools
const searchTool = tool({
  name: 'Web Search',
  description: 'Search the web for information',
  parameters: {
    query: 'string',
  },
  execute: async ({ query }) => {
    // Simulate search operation
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return `Search results for: ${query}`;
  },
});

const analyzeTool = tool({
  name: 'Data Analysis',
  description: 'Analyze data and generate insights',
  parameters: {
    data: 'string',
  },
  execute: async ({ data }) => {
    // Simulate analysis operation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return `Analysis complete for: ${data}`;
  },
});

// Example agent with tools
const searchAgent = agent({
  id: 'search-agent',
  name: 'Search Agent',
  description: 'You help users search for information and provide detailed responses.',
  prompt: 'You help users search for information and provide detailed responses.',
  tools: () => [searchTool, analyzeTool],
});

// Create graph with status updates enabled
export const graph = agentGraph({
  id: 'status-updates-demo',
  name: 'Status Updates Demo Graph',
  description: 'Demonstrates intelligent status updates during agent processing',
  defaultAgent: searchAgent,
  agents: () => [searchAgent],

  // Model Settings with summarizer
  models: {
    base: { model: 'claude-3-5-sonnet-20241022' },
    summarizer: { model: 'claude-3-5-sonnet-20241022' }, // Use Claude for status summaries
  },

  // Status updates configuration
  statusUpdates: {
    numEvents: 3, // Send update every 3 events (tool calls, generations, etc.)
    timeInSeconds: 15, // Also send update every 15 seconds
  },
});

/**
 * Example Usage:
 *
 * When this graph processes a user request, it will:
 *
 * 1. Use the search and analyze tools as needed
 * 2. Track all events in the GraphSession (tool calls, generations, etc.)
 * 3. After every 3 events OR every 15 seconds, generate an intelligent status update like:
 *    - "Searched for information about your topic and now analyzing the results..."
 *    - "Found relevant data and generating insights for your request..."
 *    - "Completing analysis and preparing comprehensive response..."
 *
 * The status updates:
 * - Hide internal agent names and operations
 * - Focus on user-visible progress
 * - Use the graph's summarizer model (Claude) to generate contextual summaries
 * - Are sent as 'status_update' data-operations via the stream
 *
 * This provides users with ChatGPT-style progress updates showing what's been
 * accomplished and what's currently happening, without exposing internal details.
 */
