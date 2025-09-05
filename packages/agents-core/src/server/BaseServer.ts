import type { Server as HttpServer } from 'node:http';
import type { Http2Server } from 'node:http2';
import { serve } from '@hono/node-server';
import { OpenAPIHono } from '@hono/zod-openapi';
import type {
  CredentialStore,
  AgentFrameworkServerConfig,
  ServerOptions,
} from '../types/server.js';
import type { ExecutionContext } from '../types/utility.js';

/**
 * OpenAPIHono instance pre-configured with ExecutionContext variables
 * Usage: const app = new OpenApiHonoScoped()
 */
export class OpenApiHonoWithExecutionContext extends OpenAPIHono<{
  Variables: {
    executionContext: ExecutionContext;
  };
}> {
  constructor() {
    super();
  }
}

//

/**
 * Base server class providing common functionality for all Inkeep services
 * Handles credential stores, server lifecycle, graceful shutdown, and error handling
 */
export abstract class BaseServer {
  protected config: AgentFrameworkServerConfig;
  protected app: OpenApiHonoWithExecutionContext | null = null;
  protected credentialStores: Map<string, CredentialStore> = new Map();
  protected server: HttpServer | Http2Server | null = null;
  protected isShuttingDown = false;
  protected logger: any;

  constructor(config: AgentFrameworkServerConfig = {}, logger: any) {
    this.config = config;
    this.logger = logger;

    // Initialize credential stores
    if (config.credentialStores) {
      for (const store of config.credentialStores) {
        this.credentialStores.set(store.id, store);
      }
    }
  }

  /**
   * Get a credential store by ID
   */
  getCredentialStore(id: string): CredentialStore | undefined {
    return this.credentialStores.get(id);
  }

  /**
   * Add a credential store
   */
  addCredentialStore(store: CredentialStore): void {
    this.credentialStores.set(store.id, store);
  }

  /**
   * Get all credential stores
   */
  getCredentialStores(): CredentialStore[] {
    return Array.from(this.credentialStores.values());
  }

  /**
   * Abstract method to initialize the application
   * Each service implements this to load their specific app
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Get default server options - can be overridden by subclasses
   */
  protected getServerOptions(): ServerOptions {
    return {
      port: this.config.port || 3000,
      keepAliveTimeout: 60000,
      keepAlive: true,
      requestTimeout: 60000,
      ...this.config.serverOptions,
    };
  }

  /**
   * Start the server
   */
  async serve(): Promise<void> {
    if (!this.app) {
      await this.initialize();
    }

    if (!this.app) {
      throw new Error('Failed to initialize the application');
    }

    const serverOptions = this.getServerOptions();

    this.server = serve({
      serverOptions: {
        keepAliveTimeout: serverOptions.keepAliveTimeout,
        keepAlive: serverOptions.keepAlive,
        requestTimeout: serverOptions.requestTimeout,
      },
      fetch: this.app.fetch,
      port: serverOptions.port,
    });

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    this.logger.info(`✅ Server is running on port ${serverOptions.port}`);
  }

  /**
   * Setup graceful shutdown handlers for various signals
   */
  protected setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

    for (const signal of signals) {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          this.logger.warn(`Received ${signal} during shutdown, forcing exit`);
          process.exit(1);
        }

        this.logger.info(`Received ${signal}, starting graceful shutdown`);
        await this.gracefulShutdown();
      });
    }

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error) => {
      this.logger.error({ error }, 'Uncaught exception, shutting down');
      this.gracefulShutdown().finally(() => process.exit(1));
    });

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error({ reason, promise }, 'Unhandled rejection, shutting down');
      this.gracefulShutdown().finally(() => process.exit(1));
    });
  }

  /**
   * Perform graceful shutdown - can be overridden by subclasses for custom cleanup
   */
  protected async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown');

    try {
      // Allow subclasses to perform custom cleanup
      await this.beforeShutdown();

      // Stop accepting new connections
      await this.stop();

      // Give existing requests time to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      this.logger.error({ error }, 'Error during graceful shutdown');
      process.exit(1);
    }
  }

  /**
   * Hook for subclasses to perform cleanup before shutdown
   */
  protected async beforeShutdown(): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override to clean up resources
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Stopping server gracefully');

    try {
      // The @hono/node-server's serve() returns a Node.js HTTP server instance
      if (this.server && typeof this.server.close === 'function') {
        // Close idle connections first to speed up shutdown (HTTP1 only)
        if (
          'closeIdleConnections' in this.server &&
          typeof this.server.closeIdleConnections === 'function'
        ) {
          this.server.closeIdleConnections();
          this.logger.info('Closed idle connections');
        }

        // Stop accepting new connections and wait for existing ones to finish
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.logger.warn('Graceful shutdown timeout, forcing close of remaining connections');
            // Force close remaining connections as last resort
            if (
              this.server &&
              'closeAllConnections' in this.server &&
              typeof this.server.closeAllConnections === 'function'
            ) {
              this.server.closeAllConnections();
            }
            resolve();
          }, 5000);

          this.server?.close((error?: Error) => {
            clearTimeout(timeout);
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      } else if (this.server && 'stop' in this.server && typeof this.server.stop === 'function') {
        // Fallback for other server implementations
        await (this.server as any).stop();
      }

      this.logger.info('Server stopped successfully');
    } catch (error) {
      this.logger.error({ error }, 'Error stopping server');
      throw error;
    } finally {
      this.server = null;
    }
  }

  /**
   * Get the Hono app instance (for testing or advanced usage)
   */
  getApp(): OpenApiHonoWithExecutionContext | null {
    return this.app;
  }

  /**
   * Get the current configuration
   */
  getConfig(): AgentFrameworkServerConfig {
    return { ...this.config };
  }

  /**
   * Check if the server is currently shutting down
   */
  isShuttingDownStatus(): boolean {
    return this.isShuttingDown;
  }
}
