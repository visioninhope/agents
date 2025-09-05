import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { ManagementApiClient } from '../api.js';
import { validateConfiguration } from '../config.js';

export interface ListGraphsOptions {
  tenantId?: string;
  managementApiUrl?: string;
  configFilePath?: string;
}

export async function listGraphsCommand(options: ListGraphsOptions) {
  // Check if we need to re-run with tsx for TypeScript config files
  if (!process.env.TSX_RUNNING) {
    // Helper function to find config file
    function findConfigFile(startPath: string = process.cwd()): string | null {
      let currentPath = resolve(startPath);
      const root = '/';

      const configNames = ['inkeep.config.ts', 'inkeep.config.js', '.inkeeprc.ts', '.inkeeprc.js'];

      while (currentPath !== root) {
        // Check for config files at this level
        for (const configName of configNames) {
          const configPath = resolve(currentPath, configName);
          if (existsSync(configPath)) {
            return configPath;
          }
        }

        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) {
          break; // Reached filesystem root
        }
        currentPath = parentPath;
      }

      return null;
    }

    // Determine if we have a TypeScript config that needs tsx
    let configPath: string | null = null;

    if (options?.configFilePath) {
      // User specified a config path
      configPath = resolve(process.cwd(), options.configFilePath);
      if (!existsSync(configPath)) {
        // Config file doesn't exist, let the normal flow handle the error
        configPath = null;
      }
    } else {
      // Search for config file
      configPath = findConfigFile();
    }

    // If we found a TypeScript config file, re-run with tsx
    if (configPath && extname(configPath) === '.ts') {
      // Re-run this command with tsx
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const cliPath = resolve(__dirname, '../index.js');
      const args = [cliPath, 'list-graphs'];
      if (options?.tenantId) args.push('--tenant-id', options.tenantId);
      if (options?.managementApiUrl) args.push('--management-api-url', options.managementApiUrl);
      if (options?.configFilePath) args.push('--config-file-path', options.configFilePath);

      const child = spawn('npx', ['tsx', ...args], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, TSX_RUNNING: '1' },
      });

      child.on('error', (error) => {
        console.error(chalk.red('Failed to load TypeScript configuration:'), error.message);
        process.exit(1);
      });

      child.on('exit', (code) => {
        process.exit(code || 0);
      });

      return;
    }
  }

  // Validate configuration
  let config;
  try {
    config = await validateConfiguration(
      options.tenantId,
      options.managementApiUrl,
      undefined, // executionApiUrl not needed for list-graphs
      options.configFilePath
    );
  } catch (error: any) {
    console.error(chalk.red(error.message));
    process.exit(1);
  }

  // Log configuration sources for debugging
  console.log(chalk.gray('Using configuration:'));
  console.log(chalk.gray(`  • Tenant ID: ${config.sources.tenantId}`));
  console.log(chalk.gray(`  • API URL: ${config.sources.managementApiUrl}`));
  console.log();

  const api = await ManagementApiClient.create(
    config.managementApiUrl,
    options.configFilePath,
    config.tenantId
  );
  const spinner = ora('Fetching graphs...').start();

  try {
    const graphs = await api.listGraphs();
    spinner.succeed(`Found ${graphs.length} graph(s)`);

    if (graphs.length === 0) {
      console.log(chalk.gray('No graphs found. Push a graph with: inkeep push <graph-path>'));
      return;
    }

    // Create a table to display graphs
    const table = new Table({
      head: [
        chalk.cyan('Graph ID'),
        chalk.cyan('Name'),
        chalk.cyan('Default Agent'),
        chalk.cyan('Created'),
      ],
      style: {
        head: [],
        border: [],
      },
    });

    for (const graph of graphs) {
      const createdDate = graph.createdAt
        ? new Date(graph.createdAt).toLocaleDateString()
        : 'Unknown';

      table.push([
        graph.id || '',
        graph.name || graph.id || '',
        graph.defaultAgentId || chalk.gray('None'),
        createdDate,
      ]);
    }

    console.log('\n' + table.toString());
  } catch (error) {
    spinner.fail('Failed to fetch graphs');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
