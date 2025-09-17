import type {
  CredentialReferenceApiInsert,
  FullGraphDefinition,
  GraphStopWhen,
} from '@inkeep/agents-core';
import { createDatabaseClient, getLogger, getProject } from '@inkeep/agents-core';
import { ExternalAgent } from './externalAgent';
import { updateFullGraphViaAPI } from './graphFullClient';
import type {
  AgentInterface,
  AllAgentInterface,
  ExternalAgentInterface,
  GenerateOptions,
  GraphConfig,
  GraphInterface,
  MessageInput,
  ModelSettings,
  RunResult,
  StatusUpdateSettings,
  StreamResponse,
} from './types';

const logger = getLogger('graph');

// Helper function to resolve getter functions
function resolveGetter<T>(value: T | (() => T) | undefined): T | undefined {
  if (typeof value === 'function') {
    return (value as () => T)();
  }
  return value as T | undefined;
}

export class AgentGraph implements GraphInterface {
  private agents: AllAgentInterface[] = [];
  private agentMap: Map<string, AllAgentInterface> = new Map();
  private defaultAgent?: AgentInterface;
  private baseURL: string;
  private tenantId: string;
  private projectId: string;
  private graphId: string;
  private graphName: string;
  private graphDescription?: string;
  private initialized = false;
  private contextConfig?: any; // ContextConfigBuilder
  private credentials?: CredentialReferenceApiInsert[];
  private models?: {
    base?: ModelSettings;
    structuredOutput?: ModelSettings;
    summarizer?: ModelSettings;
  };
  private statusUpdateSettings?: StatusUpdateSettings;
  private graphPrompt?: string;
  private stopWhen?: GraphStopWhen;
  private dbClient: ReturnType<typeof createDatabaseClient>;

  constructor(config: GraphConfig) {
    this.defaultAgent = config.defaultAgent;
    this.tenantId = config.tenantId || 'default';
    this.projectId = 'default'; // Default project ID, will be overridden by setConfig
    this.graphId = config.id;
    this.graphName = config.name || this.graphId;
    this.graphDescription = config.description;
    this.baseURL = process.env.INKEEP_API_URL || 'http://localhost:3002';
    this.contextConfig = config.contextConfig;
    this.credentials = resolveGetter(config.credentials);
    this.models = config.models;

    // Initialize database client
    // In test environment, always use in-memory database
    const dbUrl =
      process.env.ENVIRONMENT === 'test'
        ? ':memory:'
        : process.env.DB_FILE_NAME || process.env.DATABASE_URL || ':memory:';

    this.dbClient = createDatabaseClient({
      url: dbUrl,
    });
    this.statusUpdateSettings = config.statusUpdates;
    this.graphPrompt = config.graphPrompt;
    // Set stopWhen - preserve original config or set default during inheritance
    this.stopWhen = config.stopWhen
      ? {
          transferCountIs: config.stopWhen.transferCountIs,
        }
      : undefined;
    this.agents = resolveGetter(config.agents) || [];
    this.agentMap = new Map(this.agents.map((agent) => [agent.getId(), agent]));

    // Add default agent to map
    if (this.defaultAgent) {
      this.agents.push(this.defaultAgent);
      this.agentMap.set(this.defaultAgent.getId(), this.defaultAgent);
    }

    // Propagate graph-level models to agents immediately (if graph has models)
    if (this.models) {
      this.propagateImmediateModelSettings();
    }

    logger.info(
      {
        graphId: this.graphId,
        tenantId: this.tenantId,
        agentCount: this.agents.length,
        defaultAgent: this.defaultAgent?.getName(),
      },
      'AgentGraph created'
    );
  }

  /**
   * Set or update the configuration (tenantId, projectId and apiUrl)
   * This is used by the CLI to inject configuration from inkeep.config.ts
   */
  setConfig(tenantId: string, projectId: string, apiUrl: string): void {
    if (this.initialized) {
      throw new Error('Cannot set config after graph has been initialized');
    }

    this.tenantId = tenantId;
    this.projectId = projectId;
    this.baseURL = apiUrl;

    // Propagate tenantId to all agents and their tools
    for (const agent of this.agents) {
      if (this.isInternalAgent(agent)) {
        const internalAgent = agent as AgentInterface;
        if (!internalAgent.config.tenantId) {
          internalAgent.config.tenantId = tenantId;
        }

        // Also update tools in this agent
        const tools = internalAgent.getTools();
        for (const [_, toolInstance] of Object.entries(tools)) {
          if (toolInstance && typeof toolInstance === 'object' && toolInstance.config) {
            if (!toolInstance.config.tenantId) {
              toolInstance.config.tenantId = tenantId;
            }
            // Also update baseURL for tools if they have one
            if ('baseURL' in toolInstance && !toolInstance.baseURL) {
              toolInstance.baseURL = apiUrl;
            }
          }
        }
      }
    }

    // Update context config tenant ID if present
    if (this.contextConfig && !this.contextConfig.tenantId) {
      this.contextConfig.tenantId = tenantId;
    }

    logger.info(
      {
        graphId: this.graphId,
        tenantId: this.tenantId,
        projectId: this.projectId,
        apiUrl: this.baseURL,
      },
      'Graph configuration updated'
    );
  }

  /**
   * Convert the AgentGraph to FullGraphDefinition format for the new graph endpoint
   */
  private async toFullGraphDefinition(): Promise<FullGraphDefinition> {
    const agentsObject: Record<string, any> = {};

    for (const agent of this.agents) {
      if (this.isInternalAgent(agent)) {
        // Handle internal agents
        const internalAgent = agent as AgentInterface;

        // Get agent relationships
        const transfers = internalAgent.getTransfers();
        const delegates = internalAgent.getDelegates();

        // Convert tools to the expected format (agent.tools should be an array of tool IDs)
        const tools: string[] = [];
        const selectedToolsMapping: Record<string, string[]> = {};
        const agentTools = internalAgent.getTools();

        for (const [_toolName, toolInstance] of Object.entries(agentTools)) {
          if (toolInstance && typeof toolInstance === 'object') {
            let toolId: string;

            // Get tool ID
            toolId = (toolInstance as any).getId?.() || (toolInstance as any).id;

            // Check if this tool instance has selectedTools (from AgentMcpConfig processing)
            if (
              'selectedTools' in toolInstance &&
              (toolInstance as any).selectedTools !== undefined
            ) {
              logger.info(
                { toolId, selectedTools: (toolInstance as any).selectedTools },
                'Selected tools'
              );
              selectedToolsMapping[toolId] = (toolInstance as any).selectedTools;
            }

            tools.push(toolId);
          }
        }

        // Convert dataComponents to the expected format (agent.dataComponents should be an array of dataComponent IDs)
        const dataComponents: string[] = [];
        const agentDataComponents = internalAgent.getDataComponents();
        if (agentDataComponents) {
          for (const dataComponent of agentDataComponents) {
            const dataComponentId =
              dataComponent.id || dataComponent.name.toLowerCase().replace(/\s+/g, '-');
            dataComponents.push(dataComponentId);
          }
        }

        // Convert artifactComponents to the expected format (agent.artifactComponents should be an array of artifactComponent IDs)
        const artifactComponents: string[] = [];
        const agentArtifactComponents = internalAgent.getArtifactComponents();
        if (agentArtifactComponents) {
          for (const artifactComponent of agentArtifactComponents) {
            const artifactComponentId =
              artifactComponent.id || artifactComponent.name.toLowerCase().replace(/\s+/g, '-');
            artifactComponents.push(artifactComponentId);
          }
        }

        agentsObject[internalAgent.getId()] = {
          id: internalAgent.getId(),
          name: internalAgent.getName(),
          description: internalAgent.config.description || `Agent ${internalAgent.getName()}`,
          prompt: internalAgent.getInstructions(),
          models: internalAgent.config.models,
          canTransferTo: transfers.map((h) => h.getId()),
          canDelegateTo: delegates.map((d) => d.getId()),
          tools,
          selectedTools:
            Object.keys(selectedToolsMapping).length > 0 ? selectedToolsMapping : undefined,
          dataComponents: dataComponents.length > 0 ? dataComponents : undefined,
          artifactComponents: artifactComponents.length > 0 ? artifactComponents : undefined,
          type: 'internal',
        };
      } else {
        // Handle external agents
        const externalAgent = agent as ExternalAgentInterface;

        agentsObject[externalAgent.getId()] = {
          id: externalAgent.getId(),
          name: externalAgent.getName(),
          description: externalAgent.getDescription(),
          baseUrl: externalAgent.getBaseUrl(),
          credentialReferenceId: externalAgent.getCredentialReferenceId(),
          headers: externalAgent.getHeaders(),
          tools: [], // External agents don't have tools in this context
          type: 'external',
        };
      }
    }

    // Collect all tools from all agents
    const toolsObject: Record<string, any> = {};

    for (const agent of this.agents) {
      if (!(agent as AgentInterface).getTransfers) {
        continue; // Skip external agents
      }

      const internalAgent = agent as AgentInterface;
      const agentTools = internalAgent.getTools();

      for (const [toolName, toolInstance] of Object.entries(agentTools)) {
        if (toolInstance && typeof toolInstance === 'object') {
          let actualTool: any;
          let toolId: string;

          // Check if this is an AgentMcpConfig
          if ('server' in toolInstance && 'selectedTools' in toolInstance) {
            const mcpConfig = toolInstance as any; // AgentMcpConfig
            actualTool = mcpConfig.server;
            toolId = actualTool.getId();
          } else {
            // Regular tool instance
            actualTool = toolInstance;
            toolId = actualTool.getId?.() || actualTool.id || toolName;
          }

          // Only add if not already added (avoid duplicates across agents)
          if (!toolsObject[toolId]) {
            let toolConfig: any;

            // Check if it's an IPCTool with MCP server configuration
            if (actualTool.config?.serverUrl) {
              toolConfig = {
                type: 'mcp',
                mcp: {
                  server: {
                    url: actualTool.config.serverUrl,
                  },
                },
              };
            } else if (actualTool.config?.type === 'mcp') {
              // Already has proper MCP config
              toolConfig = actualTool.config;
            } else {
              // Fallback for function tools or uninitialized tools
              toolConfig = {
                type: 'function',
                parameters: actualTool.parameters || {},
              };
            }

            const toolData: any = {
              id: toolId,
              name: actualTool.config?.name || actualTool.name || toolName,
              config: toolConfig,
              status: actualTool.getStatus?.() || actualTool.status || 'unknown',
            };

            // Add additional fields if available
            if (actualTool.config?.imageUrl) {
              toolData.imageUrl = actualTool.config.imageUrl;
            }
            if (actualTool.config?.headers) {
              toolData.headers = actualTool.config.headers;
            }
            if (actualTool.capabilities) {
              toolData.capabilities = actualTool.capabilities;
            }
            if (actualTool.lastHealthCheck) {
              toolData.lastHealthCheck = actualTool.lastHealthCheck;
            }
            if (actualTool.availableTools) {
              toolData.availableTools = actualTool.availableTools;
            }
            if (actualTool.lastError) {
              toolData.lastError = actualTool.lastError;
            }
            if (actualTool.lastToolsSync) {
              toolData.lastToolsSync = actualTool.lastToolsSync;
            }
            // Add credential reference ID if available
            if (actualTool.getCredentialReferenceId?.()) {
              toolData.credentialReferenceId = actualTool.getCredentialReferenceId();
            }

            toolsObject[toolId] = toolData;
          }
        }
      }
    }

    // Collect all dataComponents from all agents
    const dataComponentsObject: Record<string, any> = {};

    for (const agent of this.agents) {
      if (!this.isInternalAgent(agent)) {
        continue; // Skip external agents
      }

      const internalAgent = agent as AgentInterface;
      const agentDataComponents = internalAgent.getDataComponents();
      if (agentDataComponents) {
        for (const dataComponent of agentDataComponents) {
          const dataComponentId =
            dataComponent.id || dataComponent.name.toLowerCase().replace(/\s+/g, '-');

          // Only add if not already added (avoid duplicates across agents)
          if (!dataComponentsObject[dataComponentId]) {
            dataComponentsObject[dataComponentId] = {
              id: dataComponentId,
              name: dataComponent.name,
              description: dataComponent.description || '',
              props: dataComponent.props || {},
            };
          }
        }
      }
    }

    // Collect all artifactComponents from all agents
    const artifactComponentsObject: Record<string, any> = {};

    for (const agent of this.agents) {
      if (!this.isInternalAgent(agent)) {
        continue; // Skip external agents
      }

      const internalAgent = agent as AgentInterface;
      const agentArtifactComponents = internalAgent.getArtifactComponents();
      if (agentArtifactComponents) {
        for (const artifactComponent of agentArtifactComponents) {
          const artifactComponentId =
            artifactComponent.id || artifactComponent.name.toLowerCase().replace(/\s+/g, '-');

          // Only add if not already added (avoid duplicates across agents)
          if (!artifactComponentsObject[artifactComponentId]) {
            artifactComponentsObject[artifactComponentId] = {
              id: artifactComponentId,
              name: artifactComponent.name,
              description: artifactComponent.description || '',
              summaryProps: artifactComponent.summaryProps || {},
              fullProps: artifactComponent.fullProps || {},
            };
          }
        }
      }
    }

    return {
      id: this.graphId,
      name: this.graphName,
      description: this.graphDescription,
      defaultAgentId: this.defaultAgent?.getId() || '',
      agents: agentsObject,
      tools: toolsObject,
      contextConfig: this.contextConfig?.toObject(),
      credentialReferences: this.credentials?.reduce(
        (acc, credentialReference) => {
          acc[credentialReference.id] = {
            type: credentialReference.type,
            id: credentialReference.id,
            credentialStoreId: credentialReference.credentialStoreId,
            retrievalParams: credentialReference.retrievalParams || {},
          };
          return acc;
        },
        {} as Record<string, any>
      ),
      models: this.models,
      statusUpdates: this.statusUpdateSettings,
      graphPrompt: this.graphPrompt,
      dataComponents:
        Object.keys(dataComponentsObject).length > 0 ? dataComponentsObject : undefined,
      artifactComponents:
        Object.keys(artifactComponentsObject).length > 0 ? artifactComponentsObject : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Initialize all tools in all agents (especially IPCTools that need MCP server URLs)
   */
  private async initializeAllTools(): Promise<void> {
    logger.info({ graphId: this.graphId }, 'Initializing all tools in graph');

    const toolInitPromises: Promise<void>[] = [];

    for (const agent of this.agents) {
      // Skip external agents as they don't have getTools method
      if (!(agent as AgentInterface).getTools) {
        continue;
      }

      const internalAgent = agent as AgentInterface;
      const agentTools = internalAgent.getTools();

      for (const [toolName, toolInstance] of Object.entries(agentTools)) {
        if (toolInstance && typeof toolInstance === 'object') {
          // Check if this is a tool that needs initialization
          if (typeof (toolInstance as any).init === 'function') {
            toolInitPromises.push(
              (async () => {
                try {
                  // Skip database registration for all tools since graphFull will handle it
                  const skipDbRegistration =
                    toolInstance.constructor.name === 'IPCTool' ||
                    toolInstance.constructor.name === 'HostedTool' ||
                    toolInstance.constructor.name === 'Tool';
                  if (typeof (toolInstance as any).init === 'function') {
                    if (skipDbRegistration) {
                      await (toolInstance as any).init({
                        skipDatabaseRegistration: true,
                      });
                    } else {
                      await (toolInstance as any).init();
                    }
                  }
                  logger.debug(
                    {
                      agentId: agent.getId(),
                      toolName,
                      toolType: toolInstance.constructor.name,
                      skipDbRegistration,
                    },
                    'Tool initialized successfully'
                  );
                } catch (error) {
                  logger.error(
                    {
                      agentId: agent.getId(),
                      toolName,
                      error: error instanceof Error ? error.message : 'Unknown error',
                    },
                    'Failed to initialize tool'
                  );
                  throw error;
                }
              })()
            );
          }
        }
      }
    }

    await Promise.all(toolInitPromises);
    logger.info(
      { graphId: this.graphId, toolCount: toolInitPromises.length },
      'All tools initialized successfully'
    );
  }

  /**
   * Initialize the graph and all agents in the backend using the new graph endpoint
   */
  async init(): Promise<void> {
    if (this.initialized) {
      logger.info({ graphId: this.graphId }, 'Graph already initialized');
      return;
    }

    logger.info(
      {
        graphId: this.graphId,
        agentCount: this.agents.length,
      },
      'Initializing agent graph using new graph endpoint'
    );

    try {
      // Initialize all tools first (especially IPCTools that need MCP server URLs)
      await this.initializeAllTools();

      // Apply model inheritance hierarchy (Project -> Graph -> Agent)
      await this.applyModelInheritance();

      // Convert to FullGraphDefinition format
      const graphDefinition = await this.toFullGraphDefinition();

      // Always use API mode (baseURL is always set)
      logger.info(
        {
          graphId: this.graphId,
          mode: 'api-client',
          apiUrl: this.baseURL,
        },
        'Using API client to create/update graph'
      );

      // Try update first (upsert behavior)
      const createdGraph = await updateFullGraphViaAPI(
        this.tenantId,
        this.projectId,
        this.baseURL,
        this.graphId,
        graphDefinition
      );

      logger.info(
        {
          graphId: this.graphId,
          agentCount: Object.keys((createdGraph as any).agents || {}).length,
        },
        'Agent graph initialized successfully using graph endpoint'
      );

      this.initialized = true;
    } catch (error) {
      logger.error(
        {
          graphId: this.graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize agent graph using graph endpoint'
      );
      throw error;
    }
  }

  /**
   * Legacy initialization method - kept for backward compatibility
   * Initialize the graph and all agents in the backend using individual endpoints
   */
  async initLegacy(): Promise<void> {
    if (this.initialized) {
      logger.info({ graphId: this.graphId }, 'Graph already initialized');
      return;
    }

    logger.info(
      {
        graphId: this.graphId,
        agentCount: this.agents.length,
      },
      'Initializing agent graph'
    );

    try {
      // Component mode has been removed

      // Step 2: Initialize context configuration if provided
      if (this.contextConfig) {
        await this.contextConfig.init();
        logger.info(
          {
            graphId: this.graphId,
            contextConfigId: this.contextConfig.getId(),
          },
          'Context configuration initialized for graph'
        );
      }

      // Step 3: Initialize all agents
      const initPromises = this.agents.map(async (agent) => {
        try {
          // Set the graphId on the agent config before initialization
          (agent as any).config.graphId = this.graphId;

          await agent.init();
          logger.debug(
            {
              agentId: agent.getId(),
              graphId: this.graphId,
            },
            'Agent initialized in graph'
          );
        } catch (error) {
          logger.error(
            {
              agentId: agent.getId(),
              graphId: this.graphId,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Failed to initialize agent in graph'
          );
          throw error;
        }
      });

      await Promise.all(initPromises);

      // Step 2: Create agent graph in database (now that agents exist)
      await this.saveToDatabase();

      // Step 3: Create external agents in database
      await this.createExternalAgents();

      // Step 4: Create agent relations (transfer and delegation) using the graph's graphId
      await this.createAgentRelations();

      // Step 5: Set up graph-level relationships
      await this.saveRelations();

      this.initialized = true;

      logger.info(
        {
          graphId: this.graphId,
          agentCount: this.agents.length,
        },
        'Agent graph initialized successfully'
      );
    } catch (error) {
      logger.error(
        {
          graphId: this.graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to initialize agent graph'
      );
      throw error;
    }
  }

  /**
   * Generate a response using the default agent
   */
  async generate(input: MessageInput, options?: GenerateOptions): Promise<string> {
    await this._init();

    if (!this.defaultAgent) {
      throw new Error('No default agent configured for this graph');
    }

    logger.info(
      {
        graphId: this.graphId,
        defaultAgent: this.defaultAgent.getName(),
        conversationId: options?.conversationId,
      },
      'Generating response with default agent'
    );

    // Use the proper backend execution instead of the local runner
    const response = await this.executeWithBackend(input, options);
    return response;
  }

  /**
   * Stream a response using the default agent
   */
  async stream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse> {
    await this._init();

    if (!this.defaultAgent) {
      throw new Error('No default agent configured for this graph');
    }

    logger.info(
      {
        graphId: this.graphId,
        defaultAgent: this.defaultAgent.getName(),
        conversationId: options?.conversationId,
      },
      'Streaming response with default agent'
    );

    // Delegate to the graph's stream method with backend
    // For now, create a simple async generator that yields the response
    const textStream = async function* (graph: AgentGraph) {
      const response = await graph.executeWithBackend(input, options);
      // Simulate streaming by yielding chunks
      const words = response.split(' ');
      for (const word of words) {
        yield `${word} `;
      }
    };

    return {
      textStream: textStream(this),
    };
  }

  /**
   * Alias for stream() method for consistency with naming patterns
   */
  async generateStream(input: MessageInput, options?: GenerateOptions): Promise<StreamResponse> {
    return await this.stream(input, options);
  }

  /**
   * Run with a specific agent from the graph
   */
  async runWith(
    agentId: string,
    input: MessageInput,
    options?: GenerateOptions
  ): Promise<RunResult> {
    await this._init();

    const agent = this.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent '${agentId}' not found in graph`);
    }

    // Only internal agents can be run directly via this method
    if (!this.isInternalAgent(agent)) {
      throw new Error(
        `Agent '${agentId}' is an external agent and cannot be run directly. External agents are only accessible via delegation.`
      );
    }

    logger.info(
      {
        graphId: this.graphId,
        agentId,
        conversationId: options?.conversationId,
      },
      'Running with specific agent'
    );

    // Use backend execution and wrap result in RunResult format
    const response = await this.executeWithBackend(input, options);

    return {
      finalOutput: response,
      agent: agent,
      turnCount: 1,
      usage: { inputTokens: 0, outputTokens: 0 },
      metadata: {
        toolCalls: [],
        transfers: [],
      },
    };
  }

  /**
   * Get an agent by name (unified method for all agent types)
   */
  getAgent(name: string): AllAgentInterface | undefined {
    return this.agentMap.get(name);
  }

  /**
   * Add an agent to the graph
   */
  addAgent(agent: AgentInterface): void {
    this.agents.push(agent);
    this.agentMap.set(agent.getId(), agent);

    // Apply immediate model inheritance if graph has models
    if (this.models && this.isInternalAgent(agent)) {
      this.propagateModelSettingsToAgent(agent as AgentInterface);
    }

    logger.info(
      {
        graphId: this.graphId,
        agentId: agent.getId(),
        agentType: this.isInternalAgent(agent) ? 'internal' : 'external',
      },
      'Agent added to graph'
    );
  }

  /**
   * Remove an agent from the graph
   */
  removeAgent(id: string): boolean {
    const agentToRemove = this.agentMap.get(id);
    if (agentToRemove) {
      this.agentMap.delete(agentToRemove.getId());
      this.agents = this.agents.filter((agent) => agent.getId() !== agentToRemove.getId());

      logger.info(
        {
          graphId: this.graphId,
          agentId: agentToRemove.getId(),
        },
        'Agent removed from graph'
      );

      return true;
    }

    return false;
  }

  /**
   * Get all agents in the graph
   */
  getAgents(): AllAgentInterface[] {
    return this.agents;
  }

  /**
   * Get all agent ids (unified method for all agent types)
   */
  getAgentIds(): string[] {
    return Array.from(this.agentMap.keys());
  }

  /**
   * Set the default agent
   */
  setDefaultAgent(agent: AgentInterface): void {
    this.defaultAgent = agent;
    this.addAgent(agent); // Ensure it's in the graph

    logger.info(
      {
        graphId: this.graphId,
        defaultAgent: agent.getId(),
      },
      'Default agent updated'
    );
  }

  /**
   * Get the default agent
   */
  getDefaultAgent(): AgentInterface | undefined {
    return this.defaultAgent;
  }

  /**
   * Get the graph ID
   */
  getId(): string {
    return this.graphId;
  }

  getName(): string {
    return this.graphName;
  }

  getDescription(): string | undefined {
    return this.graphDescription;
  }

  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Get the graph's model settingsuration
   */
  getModels(): typeof this.models {
    return this.models;
  }

  /**
   * Set the graph's model settingsuration
   */
  setModels(models: typeof this.models): void {
    this.models = models;
  }

  /**
   * Get the graph's prompt configuration
   */
  getGraphPrompt(): string | undefined {
    return this.graphPrompt;
  }

  /**
   * Get the graph's stopWhen configuration
   */
  getStopWhen(): GraphStopWhen {
    return this.stopWhen || { transferCountIs: 10 };
  }

  /**
   * Get the graph's status updates configuration
   */
  getStatusUpdateSettings(): StatusUpdateSettings | undefined {
    return this.statusUpdateSettings;
  }

  /**
   * Get the summarizer model from the graph's model settings
   */
  getSummarizerModel(): ModelSettings | undefined {
    return this.models?.summarizer;
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    agentCount: number;
    defaultAgent: string | null;
    initialized: boolean;
    graphId: string;
    tenantId: string;
  } {
    return {
      agentCount: this.agents.length,
      defaultAgent: this.defaultAgent?.getName() || null,
      initialized: this.initialized,
      graphId: this.graphId,
      tenantId: this.tenantId,
    };
  }

  /**
   * Validate the graph configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.agents.length === 0) {
      errors.push('Graph must contain at least one agent');
    }

    if (!this.defaultAgent) {
      errors.push('Graph must have a default agent');
    }

    // Validate agent names are unique
    const names = new Set<string>();
    for (const agent of this.agents) {
      const name = agent.getName();
      if (names.has(name)) {
        errors.push(`Duplicate agent name: ${name}`);
      }
      names.add(name);
    }

    // Validate agent relationships (transfer and delegation) for internal agents only
    for (const agent of this.agents) {
      if (!this.isInternalAgent(agent)) continue; // Skip external agents for relationship validation

      // Validate transfer relationships
      const transfers = agent.getTransfers();
      for (const transferAgent of transfers) {
        if (!this.agentMap.has(transferAgent.getName())) {
          errors.push(
            `Agent '${agent.getName()}' has transfer to '${transferAgent.getName()}' which is not in the graph`
          );
        }
      }

      // Validate delegation relationships
      const delegates = agent.getDelegates();
      for (const delegateAgent of delegates) {
        if (!this.agentMap.has(delegateAgent.getName())) {
          errors.push(
            `Agent '${agent.getName()}' has delegation to '${delegateAgent.getName()}' which is not in the graph`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Private helper methods
  private async _init(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * Type guard to check if an agent is an internal AgentInterface
   */
  isInternalAgent(agent: AllAgentInterface): agent is AgentInterface {
    // Internal agents have getTransfers, getDelegates, and other AgentInterface methods
    // External agents only have basic identification methods
    return 'getTransfers' in agent && typeof (agent as any).getTransfers === 'function';
  }

  /**
   * Get project-level model settingsuration defaults
   */
  private async getProjectModelDefaults(): Promise<typeof this.models | undefined> {
    try {
      const project = await getProject(this.dbClient)({
        scopes: { tenantId: this.tenantId, projectId: this.projectId },
      });

      return (project as any)?.models;
    } catch (error) {
      logger.warn(
        {
          tenantId: this.tenantId,
          projectId: this.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get project model defaults'
      );
      return undefined;
    }
  }

  /**
   * Get project-level stopWhen configuration defaults
   */
  private async getProjectStopWhenDefaults(): Promise<
    { transferCountIs?: number; stepCountIs?: number } | undefined
  > {
    try {
      const project = await getProject(this.dbClient)({
        scopes: { tenantId: this.tenantId, projectId: this.projectId },
      });

      return (project as any)?.stopWhen;
    } catch (error) {
      logger.warn(
        {
          tenantId: this.tenantId,
          projectId: this.projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to get project stopWhen defaults'
      );
      return undefined;
    }
  }

  /**
   * Apply model inheritance hierarchy: Project -> Graph -> Agent
   */
  private async applyModelInheritance(): Promise<void> {
    // Always get project defaults to check for partial inheritance
    const projectModels = await this.getProjectModelDefaults();

    if (projectModels) {
      // Initialize models object if it doesn't exist
      if (!this.models) {
        this.models = {};
      }

      // Inherit individual model types from project if not set at graph level
      if (!this.models.base && projectModels.base) {
        this.models.base = projectModels.base;
      }
      if (!this.models.structuredOutput && projectModels.structuredOutput) {
        this.models.structuredOutput = projectModels.structuredOutput;
      }
      if (!this.models.summarizer && projectModels.summarizer) {
        this.models.summarizer = projectModels.summarizer;
      }
    }

    // Apply stopWhen inheritance: Project -> Graph -> Agent
    await this.applyStopWhenInheritance();

    // Propagate to agents
    for (const agent of this.agents) {
      if (this.isInternalAgent(agent)) {
        this.propagateModelSettingsToAgent(agent as AgentInterface);
      }
    }
  }

  /**
   * Apply stopWhen inheritance hierarchy: Project -> Graph -> Agent
   */
  private async applyStopWhenInheritance(): Promise<void> {
    // Get project stopWhen defaults
    const projectStopWhen = await this.getProjectStopWhenDefaults();

    // Initialize stopWhen if it doesn't exist (graph had no stopWhen config)
    if (!this.stopWhen) {
      this.stopWhen = {};
    }

    // Inherit transferCountIs from project if graph doesn't have it explicitly set
    if (
      this.stopWhen.transferCountIs === undefined &&
      projectStopWhen?.transferCountIs !== undefined
    ) {
      this.stopWhen.transferCountIs = projectStopWhen.transferCountIs;
    }

    // Set default transferCountIs if still not set
    if (this.stopWhen.transferCountIs === undefined) {
      this.stopWhen.transferCountIs = 10;
    }

    // Propagate stepCountIs from project to agents
    if (projectStopWhen?.stepCountIs !== undefined) {
      for (const agent of this.agents) {
        if (this.isInternalAgent(agent)) {
          const internalAgent = agent as AgentInterface;

          // Initialize agent stopWhen if it doesn't exist
          if (!internalAgent.config.stopWhen) {
            internalAgent.config.stopWhen = {};
          }

          // Inherit stepCountIs from project if not set at agent level
          if (internalAgent.config.stopWhen.stepCountIs === undefined) {
            internalAgent.config.stopWhen.stepCountIs = projectStopWhen.stepCountIs;
          }
        }
      }
    }

    logger.debug(
      {
        graphId: this.graphId,
        graphStopWhen: this.stopWhen,
        projectStopWhen,
      },
      'Applied stopWhen inheritance from project to graph'
    );
  }

  /**
   * Propagate graph-level model settings to agents (supporting partial inheritance)
   */
  private propagateModelSettingsToAgent(agent: AgentInterface): void {
    if (this.models) {
      // Initialize agent models if they don't exist
      if (!agent.config.models) {
        agent.config.models = {};
      }

      // Inherit individual model types from graph if not set at agent level
      if (!agent.config.models.base && this.models.base) {
        logger.info(
          {
            agentId: agent.getId(),
            graphId: this.graphId,
            inheritingFromGraph: true,
            graphBaseModel: this.models.base.model,
            graphHasProviderOptions: !!this.models.base.providerOptions,
            providerOptionsKeys: this.models.base.providerOptions ? Object.keys(this.models.base.providerOptions) : [],
          },
          'Agent inheriting base model from graph'
        );
        agent.config.models.base = this.models.base;
        // Log what the agent has after assignment
        logger.info(
          {
            agentId: agent.getId(),
            agentBaseModel: agent.config.models.base?.model,
            agentHasProviderOptions: !!agent.config.models.base?.providerOptions,
          },
          'Agent model after inheritance'
        );
      }
      if (!agent.config.models.structuredOutput && this.models.structuredOutput) {
        agent.config.models.structuredOutput = this.models.structuredOutput;
      }
      if (!agent.config.models.summarizer && this.models.summarizer) {
        agent.config.models.summarizer = this.models.summarizer;
      }
    }
  }

  /**
   * Immediately propagate graph-level models to all agents during construction
   */
  private propagateImmediateModelSettings(): void {
    for (const agent of this.agents) {
      if (this.isInternalAgent(agent)) {
        this.propagateModelSettingsToAgent(agent as AgentInterface);
      }
    }
  }

  /**
   * Type guard to check if an agent is an external AgentInterface
   */
  isExternalAgent(agent: AllAgentInterface): agent is ExternalAgentInterface {
    return !this.isInternalAgent(agent);
  }

  /**
   * Execute agent using the backend system instead of local runner
   */
  private async executeWithBackend(
    input: MessageInput,
    options?: GenerateOptions
  ): Promise<string> {
    const normalizedMessages = this.normalizeMessages(input);

    const url = `${this.baseURL}/tenants/${this.tenantId}/graphs/${this.graphId}/v1/chat/completions`;

    logger.info({ url }, 'Executing with backend');
    const requestBody = {
      model: 'gpt-4o-mini',
      messages: normalizedMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      ...options,
      // Include conversationId for multi-turn support
      ...(options?.conversationId && {
        conversationId: options.conversationId,
      }),
      // Include context data if available
      ...(options?.customBodyParams && { ...options.customBodyParams }),
      stream: false, // Explicitly disable streaming - must come after options to override
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();

      // Check if response is SSE format (starts with "data:")
      if (responseText.startsWith('data:')) {
        // Parse SSE response
        return this.parseStreamingResponse(responseText);
      }

      // Parse regular JSON response
      const data = JSON.parse(responseText);
      return data.result || data.choices?.[0]?.message?.content || '';
    } catch (error: any) {
      throw new Error(`Graph execution failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Parse streaming response in SSE format
   */
  private parseStreamingResponse(text: string): string {
    const lines = text.split('\n');
    let content = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6); // Remove 'data: ' prefix
        if (dataStr === '[DONE]') break;

        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
          }
        } catch (_e) {
          // Skip invalid JSON lines
        }
      }
    }

    return content;
  }

  /**
   * Normalize input messages to the expected format
   */
  private normalizeMessages(input: MessageInput): Array<{ role: string; content: string }> {
    if (typeof input === 'string') {
      return [{ role: 'user', content: input }];
    }
    if (Array.isArray(input)) {
      return input.map((msg) => (typeof msg === 'string' ? { role: 'user', content: msg } : msg));
    }
    return [input];
  }

  private async saveToDatabase(): Promise<void> {
    try {
      // Check if graph already exists
      const getUrl = `${this.baseURL}/tenants/${this.tenantId}/crud/agent-graphs/${this.graphId}`;

      try {
        const getResponse = await fetch(getUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (getResponse.ok) {
          logger.info({ graphId: this.graphId }, 'Graph already exists in backend');
          return;
        }

        if (getResponse.status !== 404) {
          throw new Error(`HTTP ${getResponse.status}: ${getResponse.statusText}`);
        }
      } catch (error: any) {
        if (!error.message.includes('404')) {
          throw error;
        }
      }

      // Graph doesn't exist, create it
      logger.info({ graphId: this.graphId }, 'Creating graph in backend');

      const createUrl = `${this.baseURL}/tenants/${this.tenantId}/crud/agent-graphs`;
      const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: this.graphId,
          name: this.graphName,
          defaultAgentId: this.defaultAgent?.getId() || '',
          contextConfigId: this.contextConfig?.getId(),
          models: this.models,
        }),
      });

      if (!createResponse.ok) {
        throw new Error(`HTTP ${createResponse.status}: ${createResponse.statusText}`);
      }

      const createData = (await createResponse.json()) as {
        data: { id: string };
      };
      this.graphId = createData.data.id;
      logger.info({ graph: createData.data }, 'Graph created in backend');
    } catch (error) {
      throw new Error(
        `Failed to save graph to database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async saveRelations(): Promise<void> {
    if (this.defaultAgent) {
      try {
        const updateUrl = `${this.baseURL}/tenants/${this.tenantId}/crud/agent-graphs/${this.graphId}`;
        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: this.graphId,
            defaultAgentId: this.defaultAgent.getId(),
            contextConfigId: this.contextConfig?.getId(),
          }),
        });

        if (!updateResponse.ok) {
          throw new Error(`HTTP ${updateResponse.status}: ${updateResponse.statusText}`);
        }

        logger.debug(
          {
            graphId: this.graphId,
            defaultAgent: this.defaultAgent.getName(),
          },
          'Graph relationships configured'
        );
      } catch (error) {
        logger.error(
          {
            graphId: this.graphId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to update graph relationships'
        );
        throw error;
      }
    }
  }

  private async createAgentRelations(): Promise<void> {
    // Create both transfer and delegation relations for all agents now that they have graphId
    const allRelationPromises: Promise<void>[] = [];

    // Collect all relation creation promises from all agents
    for (const agent of this.agents) {
      if (this.isInternalAgent(agent)) {
        // Create internal transfer relations
        const transfers = agent.getTransfers();
        for (const transferAgent of transfers) {
          allRelationPromises.push(
            this.createInternalAgentRelation(agent, transferAgent, 'transfer')
          );
        }

        // Create internal delegation relations
        const delegates = agent.getDelegates();
        for (const delegate of delegates) {
          // Check if delegate is an ExternalAgent instance
          if (delegate instanceof ExternalAgent) {
            allRelationPromises.push(this.createExternalAgentRelation(agent, delegate, 'delegate'));
          } else {
            // Must be an internal agent (AgentInterface)
            allRelationPromises.push(
              this.createInternalAgentRelation(agent, delegate as AgentInterface, 'delegate')
            );
          }
        }
      }
    }

    // Use Promise.allSettled for better error handling - allows all operations to complete
    const results = await Promise.allSettled(allRelationPromises);

    // Log and collect errors without failing the entire operation
    const errors: Error[] = [];
    let successCount = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      } else {
        errors.push(result.reason);
        logger.error(
          {
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
            graphId: this.graphId,
          },
          'Failed to create agent relation'
        );
      }
    }

    logger.info(
      {
        graphId: this.graphId,
        totalRelations: allRelationPromises.length,
        successCount,
        errorCount: errors.length,
      },
      'Completed agent relation creation batch'
    );

    // Only throw if ALL relations failed, allowing partial success
    if (errors.length > 0 && successCount === 0) {
      throw new Error(`All ${errors.length} agent relation creations failed`);
    }
  }

  private async createInternalAgentRelation(
    sourceAgent: AgentInterface,
    targetAgent: AgentInterface,
    relationType: 'transfer' | 'delegate'
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/crud/agent-relations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            graphId: this.graphId,
            sourceAgentId: sourceAgent.getId(),
            targetAgentId: targetAgent.getId(),
            relationType,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');

        // Check if this is a duplicate relation (which is acceptable)
        if (response.status === 422 && errorText.includes('already exists')) {
          logger.info(
            {
              sourceAgentId: sourceAgent.getId(),
              targetAgentId: targetAgent.getId(),
              graphId: this.graphId,
              relationType,
            },
            `${relationType} relation already exists, skipping creation`
          );
          return;
        }

        throw new Error(`Failed to create agent relation: ${response.status} - ${errorText}`);
      }

      logger.info(
        {
          sourceAgentId: sourceAgent.getId(),
          targetAgentId: targetAgent.getId(),
          graphId: this.graphId,
          relationType,
        },
        `${relationType} relation created successfully`
      );
    } catch (error) {
      logger.error(
        {
          sourceAgentId: sourceAgent.getId(),
          targetAgentId: targetAgent.getId(),
          graphId: this.graphId,
          relationType,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to create ${relationType} relation`
      );
      throw error;
    }
  }

  // enableComponentMode removed – feature deprecated
  private async createExternalAgentRelation(
    sourceAgent: AgentInterface,
    externalAgent: ExternalAgentInterface,
    relationType: 'transfer' | 'delegate'
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseURL}/tenants/${this.tenantId}/crud/agent-relations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            graphId: this.graphId,
            sourceAgentId: sourceAgent.getId(),
            externalAgentId: externalAgent.getId(),
            relationType,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');

        // Check if this is a duplicate relation (which is acceptable)
        if (response.status === 422 && errorText.includes('already exists')) {
          logger.info(
            {
              sourceAgentId: sourceAgent.getId(),
              externalAgentId: externalAgent.getId(),
              graphId: this.graphId,
              relationType,
            },
            `${relationType} relation already exists, skipping creation`
          );
          return;
        }

        throw new Error(
          `Failed to create external agent relation: ${response.status} - ${errorText}`
        );
      }

      logger.info(
        {
          sourceAgentId: sourceAgent.getId(),
          externalAgentId: externalAgent.getId(),
          graphId: this.graphId,
          relationType,
        },
        `${relationType} relation created successfully`
      );
    } catch (error) {
      logger.error(
        {
          sourceAgentId: sourceAgent.getId(),
          externalAgentId: externalAgent.getId(),
          graphId: this.graphId,
          relationType,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        `Failed to create ${relationType} relation`
      );
      throw error;
    }
  }

  /**
   * Create external agents in the database
   */
  private async createExternalAgents(): Promise<void> {
    const externalAgents = this.agents.filter((agent) => this.isExternalAgent(agent));

    logger.info(
      {
        graphId: this.graphId,
        externalAgentCount: externalAgents.length,
      },
      'Creating external agents in database'
    );

    const initPromises = externalAgents.map(async (externalAgent) => {
      try {
        await externalAgent.init();
        logger.debug(
          {
            externalAgentId: externalAgent.getId(),
            graphId: this.graphId,
          },
          'External agent created in database'
        );
      } catch (error) {
        logger.error(
          {
            externalAgentId: externalAgent.getId(),
            graphId: this.graphId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Failed to create external agent in database'
        );
        throw error;
      }
    });

    try {
      await Promise.all(initPromises);

      logger.info(
        {
          graphId: this.graphId,
          externalAgentCount: externalAgents.length,
        },
        'All external agents created successfully'
      );
    } catch (error) {
      logger.error(
        {
          graphId: this.graphId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create some external agents'
      );
      throw error;
    }
  }
}

/**
 * Helper function to create graphs - OpenAI style
 */
export function agentGraph(config: GraphConfig): AgentGraph {
  return new AgentGraph(config);
}

/**
 * Factory function to create graph from configuration file
 */
export async function generateGraph(configPath: string): Promise<AgentGraph> {
  logger.info({ configPath }, 'Loading graph configuration');

  try {
    const config = await import(configPath);
    const graphConfig = config.default || config;

    const graph = agentGraph(graphConfig);
    await graph.init();

    logger.info(
      {
        configPath,
        graphId: graph.getStats().graphId,
        agentCount: graph.getStats().agentCount,
      },
      'Graph generated successfully'
    );

    return graph;
  } catch (error) {
    logger.error(
      {
        configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to generate graph from configuration'
    );
    throw error;
  }
}
