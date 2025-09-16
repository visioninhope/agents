import { getLogger } from '@inkeep/agents-core';
import { spawn } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const logger = getLogger('local-sandbox-executor');

export interface FunctionToolConfig {
  description: string;
  inputSchema: Record<string, unknown>;
  executeCode: string;
  dependencies: Record<string, string>;
  sandboxConfig?: {
    provider: 'vercel' | 'daytona' | 'local';
    runtime: 'node22' | 'python3.13' | 'typescript';
    timeout?: number;
    vcpus?: number;
  };
}

export class LocalSandboxExecutor {
  private tempDir: string;

  constructor() {
    this.tempDir = join(process.cwd(), 'temp-sandboxes');
    this.ensureTempDir();
  }

  private ensureTempDir() {
    try {
      mkdirSync(this.tempDir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  private detectModuleType(executeCode: string): 'cjs' | 'esm' {
    // Check for ES module syntax patterns
    const esmPatterns = [
      /import\s+.*\s+from\s+['"]/g, // import ... from '...'
      /import\s*\(/g, // import(...)
      /export\s+(default|const|let|var|function|class)/g, // export statements
      /export\s*\{/g, // export { ... }
    ];

    // Check for CommonJS patterns
    const cjsPatterns = [
      /require\s*\(/g, // require(...)
      /module\.exports/g, // module.exports
      /exports\./g, // exports.something
    ];

    const hasEsmSyntax = esmPatterns.some((pattern) => pattern.test(executeCode));
    const hasCjsSyntax = cjsPatterns.some((pattern) => pattern.test(executeCode));

    // If both are present, prefer ESM
    if (hasEsmSyntax && hasCjsSyntax) {
      logger.warn(
        { executeCode: `${executeCode.substring(0, 100)}...` },
        'Both ESM and CommonJS syntax detected, defaulting to ESM'
      );
      return 'esm';
    }

    // If only ESM patterns found, use ESM
    if (hasEsmSyntax) {
      return 'esm';
    }

    // If only CommonJS patterns found, use CommonJS
    if (hasCjsSyntax) {
      return 'cjs';
    }

    // Default to CommonJS for backward compatibility
    return 'cjs';
  }

  async executeFunctionTool(toolId: string, args: any, config: FunctionToolConfig): Promise<any> {
    const sandboxDir = join(this.tempDir, `sandbox-${toolId}-${Date.now()}`);

    try {
      // Create sandbox directory
      mkdirSync(sandboxDir, { recursive: true });

      // Detect module type from executeCode
      const moduleType = this.detectModuleType(config.executeCode);

      // Create package.json with dependencies
      const packageJson = {
        name: `function-tool-${toolId}`,
        version: '1.0.0',
        ...(moduleType === 'esm' && { type: 'module' }),
        dependencies: config.dependencies || {},
        scripts: {
          start: moduleType === 'esm' ? 'node index.mjs' : 'node index.js',
        },
      };

      writeFileSync(join(sandboxDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');

      // Create the function execution file with appropriate extension
      const executionCode = this.wrapFunctionCode(config.executeCode, args, moduleType);
      const fileExtension = moduleType === 'esm' ? 'mjs' : 'js';
      writeFileSync(join(sandboxDir, `index.${fileExtension}`), executionCode, 'utf8');

      // Install dependencies if any
      if (Object.keys(config.dependencies || {}).length > 0) {
        await this.installDependencies(sandboxDir);
      }

      // Execute the function
      const result = await this.executeInSandbox(
        sandboxDir,
        config.sandboxConfig?.timeout || 30000,
        moduleType
      );

      return result;
    } finally {
      // Clean up sandbox directory
      try {
        rmSync(sandboxDir, { recursive: true, force: true });
      } catch (error) {
        logger.warn({ sandboxDir, error }, 'Failed to clean up sandbox directory');
      }
    }
  }

  private async installDependencies(sandboxDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], {
        cwd: sandboxDir,
        stdio: 'pipe',
      });

      let stderr = '';

      npm.stdout?.on('data', () => {
        // Not needed for npm install
      });

      npm.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      npm.on('close', (code) => {
        if (code === 0) {
          logger.debug({ sandboxDir }, 'Dependencies installed successfully');
          resolve();
        } else {
          logger.error({ sandboxDir, code, stderr }, 'Failed to install dependencies');
          reject(new Error(`npm install failed with code ${code}: ${stderr}`));
        }
      });

      npm.on('error', (err) => {
        logger.error({ sandboxDir, error: err }, 'Failed to spawn npm install');
        reject(err);
      });
    });
  }

  private async executeInSandbox(
    sandboxDir: string,
    timeout: number,
    moduleType: 'cjs' | 'esm'
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const fileExtension = moduleType === 'esm' ? 'mjs' : 'js';
      const node = spawn('node', [`index.${fileExtension}`], {
        cwd: sandboxDir,
        stdio: 'pipe',
      });

      let stdout = '';
      let stderr = '';

      node.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      node.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        node.kill('SIGTERM');
        reject(new Error(`Function execution timed out after ${timeout}ms`));
      }, timeout);

      node.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            if (result.success) {
              resolve(result.result);
            } else {
              reject(new Error(result.error || 'Function execution failed'));
            }
          } catch {
            logger.error({ stdout, stderr }, 'Failed to parse function result');
            reject(new Error(`Invalid function result: ${stdout}`));
          }
        } else {
          logger.error({ code, stderr }, 'Function execution failed');
          reject(new Error(`Function execution failed with code ${code}: ${stderr}`));
        }
      });

      node.on('error', (error) => {
        clearTimeout(timeoutId);
        logger.error({ sandboxDir, error }, 'Failed to spawn node process');
        reject(error);
      });
    });
  }

  private wrapFunctionCode(executeCode: string, args: any, moduleType: 'cjs' | 'esm'): string {
    if (moduleType === 'esm') {
      return `
// Wrapped function execution (ESM)
const execute = ${executeCode};
const args = ${JSON.stringify(args)};

execute(args)
  .then(result => {
    console.log(JSON.stringify({ success: true, result }));
  })
  .catch(error => {
    console.log(JSON.stringify({ success: false, error: error.message }));
  });
`;
    } else {
      return `
// Wrapped function execution (CommonJS)
const execute = ${executeCode};
const args = ${JSON.stringify(args)};

execute(args)
  .then(result => {
    console.log(JSON.stringify({ success: true, result }));
  })
  .catch(error => {
    console.log(JSON.stringify({ success: false, error: error.message }));
  });
`;
    }
  }
}
