export interface GraphData {
  id: string;
  name: string;
  description?: string;
  agents: Record<string, any>;
  tools: Record<string, any>;
  contextConfigs: any[];
  credentialReferences: any[];
}

export type FullGraphDefinition = GraphData;
