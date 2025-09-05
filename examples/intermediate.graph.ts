import { agent, agentGraph } from '@inkeep/agents-sdk';

const supportAgent = agent({
  id: 'support-agent',
  name: 'Support Agent',
  description: 'A support agent',
  prompt: 'You are a support agent that can answer questions about the product or service.',
});

export const graph = agentGraph({
  id: 'intermediate-graph',
  name: 'Intermediate Graph',
  description: 'A intermediate graph',
  defaultAgent: supportAgent,
  agents: () => [supportAgent],
});
