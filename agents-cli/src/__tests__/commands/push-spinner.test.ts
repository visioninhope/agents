import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { spawn } from 'node:child_process';
import { pushCommand } from '../../commands/push.js';
import { existsSync } from 'node:fs';

// Mock dependencies
vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('@inkeep/agents-core');
vi.mock('../../config.js', () => ({
  validateConfiguration: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    projectId: 'test-project',
    managementApiUrl: 'http://localhost:3002',
    sources: {
      tenantId: 'config',
      projectId: 'config',
      managementApiUrl: 'config',
    },
  }),
}));

// Store the actual ora mock instance
let oraInstance: any;

vi.mock('ora', () => ({
  default: vi.fn(() => {
    oraInstance = {
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn().mockReturnThis(),
      fail: vi.fn().mockReturnThis(),
      warn: vi.fn().mockReturnThis(),
      stop: vi.fn().mockReturnThis(),
      text: '',
    };
    return oraInstance;
  }),
}));

describe('Push Command - TypeScript Spinner Fix', () => {
  let mockSpawn: Mock;
  let mockExit: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset ora instance
    oraInstance = null;
    
    // Ensure TSX_RUNNING is not set
    delete process.env.TSX_RUNNING;
    
    // Mock file exists
    (existsSync as Mock).mockReturnValue(true);
    
    // Mock process.exit
    mockExit = vi.fn();
    vi.spyOn(process, 'exit').mockImplementation(mockExit as any);
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(vi.fn());
    vi.spyOn(console, 'error').mockImplementation(vi.fn());
    
    // Setup spawn mock
    mockSpawn = vi.fn().mockReturnValue({
      on: vi.fn((event, callback) => {
        if (event === 'exit') {
          // Simulate successful exit
          setTimeout(() => callback(0), 10);
        }
      }),
    });
    (spawn as Mock).mockImplementation(mockSpawn);
  });

  it('should stop spinner before spawning tsx process for TypeScript files', async () => {
    await pushCommand('/test/path/graph.ts', {});
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 20));
    
    // Verify spinner was created and stopped
    expect(oraInstance).toBeDefined();
    expect(oraInstance.start).toHaveBeenCalled();
    expect(oraInstance.stop).toHaveBeenCalled();
    
    // Verify spinner.stop() was called before spawn
    const stopCallOrder = oraInstance.stop.mock.invocationCallOrder[0];
    const spawnCallOrder = mockSpawn.mock.invocationCallOrder[0];
    expect(stopCallOrder).toBeLessThan(spawnCallOrder);
  });

  it('should spawn tsx process with correct arguments for TypeScript files', async () => {
    const options = {
      tenantId: 'custom-tenant',
      managementApiUrl: 'https://api.example.com',
      configFilePath: '/path/to/config.json',
    };
    
    await pushCommand('/test/path/graph.ts', options);
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 20));
    
    // Verify spawn was called with correct arguments
    expect(mockSpawn).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining([
        'tsx',
        expect.stringContaining('index.js'),
        'push',
        '/test/path/graph.ts',
        '--tenant-id',
        'custom-tenant',
        '--management-api-url',
        'https://api.example.com',
        '--config-file-path',
        '/path/to/config.json',
      ]),
      expect.objectContaining({
        cwd: process.cwd(),
        stdio: 'inherit',
        env: expect.objectContaining({
          TSX_RUNNING: '1',
        }),
      })
    );
  });

  it('should handle spawn errors correctly without spinner', async () => {
    // Setup spawn to simulate an error
    mockSpawn.mockReturnValue({
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Spawn failed')), 10);
        }
      }),
    });
    
    await pushCommand('/test/path/graph.ts', {});
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 20));
    
    // Verify spinner was stopped before error handling
    expect(oraInstance.stop).toHaveBeenCalled();
    
    // Verify error was logged without using spinner.fail
    expect(oraInstance.fail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load TypeScript file')
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Error'),
      'Spawn failed'
    );
    
    // Verify process exited with error code
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});