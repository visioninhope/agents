import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loads a TypeScript module and returns its exports
 * This works by creating a temporary loader script that tsx can execute
 */
export async function loadTypeScriptModule(filePath: string): Promise<any> {
  const tempDir = join(tmpdir(), 'inkeep-cli-loader');
  mkdirSync(tempDir, { recursive: true });

  const loaderPath = join(tempDir, 'loader.mjs');
  const outputPath = join(tempDir, 'output.json');

  // Create a loader script that will import the module and serialize its exports
  const loaderScript = `
import { writeFileSync } from 'fs';

async function loadModule() {
    try {
        const module = await import('${pathToFileURL(filePath).href}');
        
        // Serialize the module exports (functions can't be serialized, so we just mark them)
        const serializable = {};
        
        for (const [key, value] of Object.entries(module)) {
            if (typeof value === 'function') {
                // Mark functions
                serializable[key] = { __type: 'function', name: value.name || key };
            } else if (value && typeof value === 'object') {
                // For objects, check if they have specific methods/properties
                const obj = { __type: 'object' };
                
                // Check for config-like properties (for inkeep.config.ts files)
                if (value.tenantId) obj.tenantId = value.tenantId;
                if (value.projectId) obj.projectId = value.projectId;
                if (value.apiUrl) obj.apiUrl = value.apiUrl;
                if (value.outputDirectory) obj.outputDirectory = value.outputDirectory;
                if (value.modelSettings) obj.modelSettings = value.modelSettings;
                
                // Check for tool-like properties
                if (value.id) obj.id = value.id;
                if (value.name) obj.name = value.name;
                if (value.description) obj.description = value.description;
                if (value.serverUrl) obj.serverUrl = value.serverUrl;
                if (value.port) obj.port = value.port;
                if (value.deployment) obj.deployment = value.deployment;
                if (value.transport) obj.transport = value.transport;
                if (typeof value.execute === 'function') obj.hasExecute = true;
                if (typeof value.init === 'function') obj.hasInit = true;
                if (typeof value.getServerUrl === 'function') obj.hasGetServerUrl = true;
                if (typeof value.getId === 'function') {
                    try {
                        obj.graphId = value.getId();
                    } catch {}
                }
                
                // Check if it's an array
                if (Array.isArray(value)) {
                    obj.__type = 'array';
                    obj.items = value.map(item => {
                        if (item && typeof item === 'object') {
                            const itemObj = {};
                            if (item.id) itemObj.id = item.id;
                            if (item.name) itemObj.name = item.name;
                            if (item.description) itemObj.description = item.description;
                            if (item.serverUrl) itemObj.serverUrl = item.serverUrl;
                            if (item.port) itemObj.port = item.port;
                            if (item.deployment) itemObj.deployment = item.deployment;
                            if (item.transport) itemObj.transport = item.transport;
                            if (typeof item.execute === 'function') itemObj.hasExecute = true;
                            if (typeof item.init === 'function') itemObj.hasInit = true;
                            if (typeof item.getServerUrl === 'function') itemObj.hasGetServerUrl = true;
                            return itemObj;
                        }
                        return item;
                    });
                }
                
                serializable[key] = obj;
            } else {
                serializable[key] = value;
            }
        }
        
        writeFileSync('${outputPath}', JSON.stringify(serializable, null, 2));
        process.exit(0);
    } catch (error) {
        console.error('Failed to load module:', error.message);
        writeFileSync('${outputPath}', JSON.stringify({ __error: error.message }));
        process.exit(1);
    }
}

loadModule();
`;

  try {
    // Write the loader script
    writeFileSync(loaderPath, loaderScript);

    // Execute the loader script with tsx, passing environment variables
    // Load the .env file from the graph directory if it exists
    const graphDir = dirname(filePath);
    const envPath = join(graphDir, '..', '.env');

    const envVars = { ...process.env };

    // If no environment variables are set, use test defaults
    if (!process.env.ENVIRONMENT) {
      envVars.ENVIRONMENT = 'test';
      envVars.DB_FILE_NAME = ':memory:'; // Use in-memory DB for CLI testing
      envVars.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
    }

    // Use node directly with tsx for better performance in CI
    // Try to find tsx in node_modules first for better performance
    const tsxPath = join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const command = require('fs').existsSync(tsxPath) ? tsxPath : 'tsx';
    
    execFileSync(command, [loaderPath], {
      cwd: process.cwd(), // Use cwd which is in the pnpm workspace
      stdio: 'pipe',
      encoding: 'utf-8',
      env: envVars,
      timeout: 15000, // Reduced to 15 second timeout for faster failure detection
      windowsHide: true, // Hide console window on Windows
    });

    // Read the output
    const outputJson = readFileSync(outputPath, 'utf-8');
    const output = JSON.parse(outputJson);

    // Clean up with retries to handle file locks
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });

    if (output.__error) {
      throw new Error(output.__error);
    }

    return output;
  } catch (error: any) {
    // Clean up on error
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 3 });
    } catch {}
    
    // Add more context to timeout errors
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timed out')) {
      throw new Error(`TypeScript module loading timed out for ${filePath}: ${error.message}`);
    }

    throw error;
  }
}
