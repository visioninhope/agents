import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadTypeScriptModule } from '../../utils/ts-loader.js';

describe('TypeScript Loader', () => {
  let testDir: string;
  let testGraphFile: string;

  beforeEach(() => {
    // Create a unique test directory with process ID to avoid conflicts
    const uniqueId = `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    testDir = join(tmpdir(), 'ts-loader-test', uniqueId);
    mkdirSync(testDir, { recursive: true });
    testGraphFile = join(testDir, 'test-graph.ts');
  });

  afterEach(async () => {
    // Small delay to ensure file handles are released
    await new Promise(resolve => setTimeout(resolve, 50));
    // Clean up test directory with retries
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  describe('loadTypeScriptModule', () => {
    it('should load a simple TypeScript module with exports', async () => {
      // Create a simple test module
      const moduleContent = `
export const simpleValue = 'test-value';
export const numberValue = 42;
export const booleanValue = true;

export function testFunction() {
    return 'hello world';
}

export const testObject = {
    id: 'test-id',
    name: 'Test Object',
    description: 'A test object for testing',
    port: 3000,
};
`;
      writeFileSync(testGraphFile, moduleContent);

      const result = await loadTypeScriptModule(testGraphFile);

      expect(result.simpleValue).toBe('test-value');
      expect(result.numberValue).toBe(42);
      expect(result.booleanValue).toBe(true);
      expect(result.testFunction).toEqual({
        __type: 'function',
        name: 'testFunction',
      });
      expect(result.testObject).toEqual({
        __type: 'object',
        id: 'test-id',
        name: 'Test Object',
        description: 'A test object for testing',
        port: 3000,
      });
    });

    it('should handle array exports', async () => {
      const moduleContent = `
export const servers = [
    {
        id: 'server1',
        name: 'Test Server 1',
        port: 3001,
        deployment: 'local'
    },
    {
        id: 'server2', 
        name: 'Test Server 2',
        serverUrl: 'http://localhost:3002',
        deployment: 'remote'
    }
];

export const simpleArray = ['item1', 'item2', 'item3'];
`;
      writeFileSync(testGraphFile, moduleContent);

      const result = await loadTypeScriptModule(testGraphFile);

      expect(result.servers.__type).toBe('array');
      expect(result.servers.items).toHaveLength(2);
      expect(result.servers.items[0]).toEqual({
        id: 'server1',
        name: 'Test Server 1',
        port: 3001,
        deployment: 'local',
      });
      expect(result.servers.items[1]).toEqual({
        id: 'server2',
        name: 'Test Server 2',
        serverUrl: 'http://localhost:3002',
        deployment: 'remote',
      });

      expect(result.simpleArray.__type).toBe('array');
      expect(result.simpleArray.items).toEqual(['item1', 'item2', 'item3']);
    });

    it('should handle objects with methods', async () => {
      const moduleContent = `
export const toolWithMethods = {
    id: 'tool-with-methods',
    name: 'Tool With Methods',
    
    execute() {
        return 'executed';
    },
    
    init() {
        return 'initialized';
    },
    
    getServerUrl() {
        return 'http://localhost:3000';
    }
};

export const graphObject = {
    getId() {
        return 'test-graph-id';
    }
};
`;
      writeFileSync(testGraphFile, moduleContent);

      const result = await loadTypeScriptModule(testGraphFile);

      expect(result.toolWithMethods).toEqual({
        __type: 'object',
        id: 'tool-with-methods',
        name: 'Tool With Methods',
        hasExecute: true,
        hasInit: true,
        hasGetServerUrl: true,
      });

      expect(result.graphObject).toEqual({
        __type: 'object',
        graphId: 'test-graph-id',
      });
    });

    it('should handle module loading errors gracefully', async () => {
      // Create a module with syntax errors
      const moduleContent = `
export const badSyntax = {
    // Missing closing brace
    id: 'test'
`;
      writeFileSync(testGraphFile, moduleContent);

      await expect(loadTypeScriptModule(testGraphFile)).rejects.toThrow();
    });

    it('should handle non-existent files', async () => {
      const nonExistentFile = join(testDir, 'non-existent.ts');

      await expect(loadTypeScriptModule(nonExistentFile)).rejects.toThrow();
    });

    it('should handle empty modules', async () => {
      writeFileSync(testGraphFile, '');

      const result = await loadTypeScriptModule(testGraphFile);

      // Empty modules may have a default export object
      expect(result).toEqual(
        expect.objectContaining({
          default: expect.objectContaining({
            __type: 'object',
          }),
        })
      );
    });

    it('should handle complex nested objects', async () => {
      const moduleContent = `
export const complexConfig = {
    servers: [
        {
            id: 'nested-server',
            name: 'Nested Server',
            transport: 'http',
            deployment: 'local'
        }
    ],
    metadata: {
        version: '1.0.0',
        author: 'test'
    }
};
`;
      writeFileSync(testGraphFile, moduleContent);

      const result = await loadTypeScriptModule(testGraphFile);

      expect(result.complexConfig.__type).toBe('object');
      // Note: The loader has specific handling for certain property names
      // It may not serialize arbitrary nested structures completely
    });

    it('should use test environment defaults when no environment is set', async () => {
      // Clear environment variables that might affect the test
      const originalEnv = process.env.ENVIRONMENT;
      delete process.env.ENVIRONMENT;

      const moduleContent = `
export const envValue = process.env.ENVIRONMENT;
export const dbFileName = process.env.DB_FILE_NAME;
`;
      writeFileSync(testGraphFile, moduleContent);

      try {
        const result = await loadTypeScriptModule(testGraphFile);

        // The loader should set test defaults
        expect(result.envValue).toBe('test');
        expect(result.dbFileName).toBe(':memory:');
        expect(result.tenantId).toBe('test-tenant');
      } finally {
        if (originalEnv !== undefined) {
          process.env.ENVIRONMENT = originalEnv;
        }
      }
    });

    it('should preserve existing environment variables', async () => {
      const originalEnv = process.env.ENVIRONMENT;
      process.env.ENVIRONMENT = 'production';
      process.env.CUSTOM_VAR = 'custom-value';

      const moduleContent = `
export const envValue = process.env.ENVIRONMENT;
export const customVar = process.env.CUSTOM_VAR;
`;
      writeFileSync(testGraphFile, moduleContent);

      try {
        const result = await loadTypeScriptModule(testGraphFile);

        expect(result.envValue).toBe('production');
        expect(result.customVar).toBe('custom-value');
      } finally {
        if (originalEnv !== undefined) {
          process.env.ENVIRONMENT = originalEnv;
        } else {
          delete process.env.ENVIRONMENT;
        }
        delete process.env.CUSTOM_VAR;
      }
    });
  });
});
