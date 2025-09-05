# Inkeep CLI

A command-line interface for managing and interacting with Inkeep Agent Framework graphs.

## Installation & Setup

### Prerequisites

- Node.js >= 20.x
- pnpm package manager
- Inkeep Agent Framework backend running (default: http://localhost:3002)

### Quick Start

> **📖 For detailed setup instructions, see [SETUP.md](./SETUP.md)**

1. **Install and build**
   ```bash
   # Navigate to the CLI directory
   cd /path/to/agent-framework/agents-cli
   
   # Install dependencies
   pnpm install
   
   # Build the CLI
   pnpm build
   ```

2. **Install globally** (recommended)
   
   **Option A: Using npm link (for development)**
   ```bash
   # Create global symlink from the agents-cli directory
   npm link
   
   # Verify installation
   which inkeep  # Should show path to inkeep command
   ```
   
   **Option B: Using pnpm/npm global install (after publishing)**
   ```bash
   # Install the scoped package globally
   pnpm add -g @inkeep/agents-cli
   # or
   npm install -g @inkeep/agents-cli
   
   # Verify installation
   inkeep --version
   ```
   
   **Note:** 
   - For local development, use `npm link` (more reliable than `pnpm link --global`)
   - The command is still `inkeep` even though the package name is `@inkeep/agents-cli`
   - If linking fails, try unlinking first: `npm unlink -g @inkeep/agents-cli`

3. **Configure tenant**
   ```bash
   # Set your tenant ID (required for most commands)
   inkeep tenant your-tenant-id
   
   # Verify configuration
   inkeep tenant
   ```

## Configuration

### Configuration Sources (priority order)

1. **Command-line flags** - Highest priority (e.g., `--tenant-id`, `--api-url`)
2. **Environment variables** - `INKEEP_TENANT_ID`, `INKEEP_API_URL`
3. **`.env` file** - In current directory
4. **Config file** - `inkeep.config.ts` or `.inkeeprc.ts/js`
5. **Defaults** - Lowest priority (api-url defaults to `http://localhost:3002`)

### Environment Variables

Create a `.env` file in your project directory:

```bash
INKEEP_TENANT_ID=your-tenant-id
INKEEP_API_URL=http://localhost:3002
```

Or export them in your shell:

```bash
export INKEEP_TENANT_ID=your-tenant-id
export INKEEP_API_URL=http://localhost:3002
```

## Commands

### `inkeep tenant [tenant-id]`

Manage tenant configuration.

```bash
# Set tenant ID
inkeep tenant my-tenant

# View current tenant ID
inkeep tenant
```

### `inkeep list-graphs`

List all available graphs for the current tenant.

```bash
inkeep list-graphs

# With custom API URL
inkeep list-graphs --url http://api.example.com:3002
```

Output:
```
┌─────────────────────────┬────────────────────┬───────────────┬───────────┐
│ Graph ID                │ Name               │ Default Agent │ Created   │
├─────────────────────────┼────────────────────┼───────────────┼───────────┤
│ customer-support-graph  │ Customer Support   │ router        │ 1/15/2025 │
│ qa-assistant           │ QA Assistant       │ qa-agent      │ 1/14/2025 │
└─────────────────────────┴────────────────────┴───────────────┴───────────┘
```

### `inkeep push <config-path>`

Push a graph configuration to the backend.

```bash
# Push a graph configuration
inkeep push ./my-graph.js

# With custom API URL
inkeep push ./graph.ts --url http://api.example.com:3002
```

**Features:**
- Automatically injects tenant ID and API URL from `inkeep.config.ts`
- Validates exactly one AgentGraph is exported
- Warns about dangling resources (unreferenced agents/tools)
- Shows graph summary after successful push
- Handles graph initialization automatically

**Graph naming convention:** Graph files should follow the `*.graph.ts` naming pattern (e.g., `customer-support.graph.ts`, `qa-assistant.graph.ts`)

**Example graph configuration:**

```javascript
// customer-support.graph.ts
import { agent, agentGraph, tool } from '@inkeep/agents-manage-api/builder';

const assistantAgent = agent({
    id: 'assistant',
    name: 'Assistant',
    instructions: 'Help users with their questions',
    tools: {
        search: searchTool
    }
    // No tenantId needed - injected by CLI
});

// Must export exactly one graph
export const graph = agentGraph({
    id: 'my-assistant',
    name: 'My Assistant Graph',
    defaultAgent: assistantAgent,
    agents: {
        assistant: assistantAgent
    }
    // No tenantId or apiUrl needed - CLI injects from config
});
// No graph.init() call - CLI handles initialization
```

### `inkeep chat [graph-id]`

Start an interactive chat session with a graph.

```bash
# Chat with specific graph
inkeep chat my-graph-id

# Interactive graph selection (with search)
inkeep chat

# With custom API URL
inkeep chat --url http://api.example.com:3002
```

**Interactive Features:**
- **Graph selection**: If no graph ID provided, shows searchable list
- **Chat commands**:
  - `help` - Show available commands
  - `clear` - Clear screen (preserves context)
  - `history` - Show conversation history
  - `reset` - Reset conversation context
  - `exit` - End chat session

### `inkeep mcp start <graph-file>`

Start MCP (Model Context Protocol) servers defined in a graph file.

```bash
# Start MCP servers from a TypeScript graph file
inkeep mcp start examples/agent-configurations/graph.graph.ts

# Start from compiled JavaScript
inkeep mcp start dist/examples/agent-configurations/graph.graph.js

# Run in detached mode
inkeep mcp start graph.graph.ts --detached

# Show verbose output
inkeep mcp start graph.graph.ts --verbose
```

**Features:**
- Supports both TypeScript (`.ts`) and JavaScript (`.js`) files
- Automatically allocates ports for local servers (3100-3200)
- Shows server names, ports, and URLs
- Distinguishes between local (🏠) and remote (☁️) servers

### `inkeep mcp stop`

Stop running MCP servers.

```bash
# Stop all servers
inkeep mcp stop --all

# Stop servers for a specific graph
inkeep mcp stop --graph customer-support-graph
```

### `inkeep mcp status`

Show status of all MCP servers.

```bash
inkeep mcp status
```

Output shows:
- Process ID
- Graph ID
- Tool name
- Port/URL
- Running status
- Uptime

### `inkeep mcp list`

List all MCP servers with detailed information.

```bash
# Default tree view
inkeep mcp list

# Table format
inkeep mcp list --format table

# Verbose output (includes descriptions)
inkeep mcp list --verbose
```



## Complete Workflow Example

### Basic Setup
```bash
# Install and link CLI
cd agents-cli
pnpm install
pnpm build
npm link

# Configure tenant
inkeep tenant test-tenant
```

### Working with Graphs and MCP Servers

1. **Create a graph with MCP tools** (`my-graph.graph.ts`)
```typescript
import { agent, agentGraph, mcpServer } from '@inkeep/agents-manage-api/builder';

// Define MCP servers (tools)
const randomNumberServer = mcpServer({
    name: 'random_number',
    description: 'Generates a random number',
    execute: async () => Math.random()
});

const weatherServer = mcpServer({
    name: 'weather_api',
    description: 'Get weather information',
    serverUrl: 'https://api.weather.example.com/mcp'
});

// Define agents
const assistantAgent = agent({
    id: 'assistant',
    name: 'Assistant',
    instructions: 'Help users with various tasks',
    tools: {
        random: randomNumberServer,
        weather: weatherServer
    }
});

// Export the graph
export const graph = agentGraph({
    id: 'my-assistant',
    name: 'My Assistant',
    defaultAgent: assistantAgent,
    agents: { assistant: assistantAgent }
});

// Export servers for MCP management
export const servers = [randomNumberServer, weatherServer];
```

2. **Start MCP servers and chat**
```bash
# Start MCP servers (works with TypeScript directly!)
inkeep mcp start my-graph.graph.ts

# In another terminal, start chatting
inkeep chat my-assistant

# Try commands like:
# > "Generate a random number"
# > "What's the weather like?"
```

3. **Monitor and manage servers**
```bash
# Check server status
inkeep mcp status

# List all servers with details
inkeep mcp list

# Stop servers when done
inkeep mcp stop --all
```

## Working with Different Environments

### Development
```bash
# Using environment variable
INKEEP_API_URL=http://localhost:3002 inkeep list-graphs

# Using .env file
echo "INKEEP_API_URL=http://localhost:3002" > .env
inkeep chat my-graph
```

### Staging
```bash
# Using command flag
inkeep push graph.js --url https://staging-api.example.com

# Set in config file
# Edit your inkeep.config.ts to set apiUrl: 'https://staging-api.example.com'
```

### Production
```bash
# Using environment variables
export INKEEP_API_URL=https://api.example.com
export INKEEP_TENANT_ID=prod-tenant
inkeep list-graphs
```

## Development

### Running from Source

```bash
# Without building (using tsx)
pnpm tsx src/index.ts <command>

# After building
node dist/index.js <command>

# Watch mode (auto-rebuild on changes)
pnpm dev
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage
```

### Type Checking

```bash
pnpm typecheck
```

### Project Structure

```
agents-cli/
├── src/
│   ├── index.ts              # Main CLI entry point
│   ├── config.ts             # Configuration management
│   ├── api.ts                # API client for backend
│   ├── commands/             # Command implementations
│   │   ├── push.ts           # Push graph configurations
│   │   ├── chat.ts           # Basic chat interface
│   │   ├── chat-enhanced.ts  # Enhanced chat with autocomplete
│   │   ├── tenant.ts         # Tenant management
│   │   └── list-graphs.ts    # List graphs
│   ├── types/                # TypeScript declarations
│   └── __tests__/            # Test files
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Common Issues

**"No tenant ID configured"**
```bash
# Set tenant ID
inkeep tenant your-tenant-id

# Or use environment variable
export INKEEP_TENANT_ID=your-tenant-id
```

**"Failed to fetch graphs" or connection errors**
```bash
# Check if backend is running
curl http://localhost:3002/health

# Verify API URL
echo $INKEEP_API_URL

# Try with explicit URL
inkeep list-graphs --url http://localhost:3002
```


**"Graph not found" when using chat**
```bash
# List available graphs first
inkeep list-graphs

# Use interactive selection
inkeep chat
# (Select from list)
```

**Command not found: inkeep**
```bash
# Ensure CLI is linked globally
cd agents-cli
npm link

# Or if published, install globally
pnpm add -g @inkeep/agents-cli
# or
npm install -g @inkeep/agents-cli

# Or add to PATH manually (for development)
export PATH="$PATH:/path/to/agents-cli/dist"
```

## Dependencies

### Runtime Dependencies
- **commander**: Command-line framework
- **chalk**: Terminal styling
- **dotenv**: Environment variable loading
- **ora**: Loading spinners
- **cli-table3**: Table formatting
- **inquirer**: Interactive prompts
- **inquirer-autocomplete-prompt**: Searchable selections

### Development Dependencies
- **typescript**: TypeScript compiler
- **@types/node**: Node.js types
- **vitest**: Testing framework
- **@vitest/coverage-v8**: Coverage reporting

## Requirements

- Node.js >= 20.x
- pnpm package manager
- TypeScript 5.x
- Inkeep Agent Framework backend

## License

MIT