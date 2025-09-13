import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { getLogger } from '../logger';

const logger = getLogger('ModelFactory');

export interface ModelSettings {
  model?: string;
  providerOptions?: Record<string, unknown>;
}

/**
 * Factory for creating AI SDK language models from configuration
 * Supports multiple providers and AI Gateway integration
 */
export class ModelFactory {
  /**
   * Create a language model instance from configuration
   * Throws error if no config provided - models must be configured at project level
   */
  static createModel(config: ModelSettings): LanguageModel {
    if (!config?.model?.trim()) {
      throw new Error(
        'Model configuration is required. Please configure models at the project level.'
      );
    }

    const modelSettings = config;
    const modelString = modelSettings.model!.trim();
    const { provider, modelName } = ModelFactory.parseModelString(modelString);

    logger.debug(
      {
        provider,
        model: modelName,
        fullModelString: modelSettings.model,
        hasProviderOptions: !!modelSettings.providerOptions,
      },
      'Creating language model from config'
    );

    try {
      switch (provider) {
        case 'anthropic':
          return ModelFactory.createAnthropicModel(modelName, modelSettings.providerOptions);

        case 'openai':
          return ModelFactory.createOpenAIModel(modelName, modelSettings.providerOptions);

        case 'openrouter':
          return ModelFactory.createOpenRouterModel(modelName, modelSettings.providerOptions);

        case 'custom':
          return ModelFactory.createCustomProviderModel(modelName, modelSettings.providerOptions);

        default:
          throw new Error(
            `Unsupported provider: ${provider}. Supported providers are: ${ModelFactory.SUPPORTED_PROVIDERS.join(', ')}`
          );
      }
    } catch (error) {
      logger.error(
        {
          provider,
          model: modelName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to create model'
      );

      // Re-throw the error instead of falling back to a default
      throw new Error(
        `Failed to create model ${modelString}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Supported providers for security validation
   */
  private static readonly SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'openrouter', 'custom'] as const;

  /**
   * Parse model string to extract provider and model name
   * Examples: 
   *   - "anthropic/claude-4-sonnet" -> { provider: "anthropic", modelName: "claude-4-sonnet" }
   *   - "openai/gpt-4" -> { provider: "openai", modelName: "gpt-4" }
   *   - "openrouter/meta-llama/llama-2-70b-chat" -> { provider: "openrouter", modelName: "meta-llama/llama-2-70b-chat" }
   *   - "custom/my-model" -> { provider: "custom", modelName: "my-model" }
   *   - "claude-4-sonnet" -> { provider: "anthropic", modelName: "claude-4-sonnet" } (default to anthropic)
   */
  static parseModelString(modelString: string): { provider: string; modelName: string } {
    // Handle format like "provider/model-name"
    if (modelString.includes('/')) {
      const [provider, ...modelParts] = modelString.split('/');
      const normalizedProvider = provider.toLowerCase();

      // Validate provider is supported
      if (!ModelFactory.SUPPORTED_PROVIDERS.includes(normalizedProvider as any)) {
        // For unknown providers, treat as custom provider with full model string
        logger.info(
          { provider: normalizedProvider, modelName: modelString },
          'Unknown provider detected, treating as custom provider'
        );
        return {
          provider: 'custom',
          modelName: modelString,
        };
      }

      return {
        provider: normalizedProvider,
        modelName: modelParts.join('/'), // In case model name has slashes (e.g., OpenRouter models)
      };
    }

    // Default to anthropic if no provider specified
    return {
      provider: 'anthropic',
      modelName: modelString,
    };
  }

  /**
   * Create an Anthropic model instance
   */
  private static createAnthropicModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    const anthropicConfig: any = {};

    // Extract provider configuration (baseURL, etc.)
    // Note: API keys should be provided via environment variables, not in configuration

    if (providerOptions?.baseUrl || providerOptions?.baseURL) {
      anthropicConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // Handle AI Gateway configuration if present
    if (providerOptions?.gateway) {
      logger.info(
        { gateway: providerOptions.gateway },
        'Setting up AI Gateway for Anthropic model'
      );
      // AI Gateway configuration would go here
      // This depends on the specific gateway implementation
      Object.assign(anthropicConfig, providerOptions.gateway);
    }

    // For AI SDK v5, model parameters like temperature are passed to generateText/streamText,
    // not to the model constructor. Only provider config (apiKey, baseURL) goes to the provider.

    if (Object.keys(anthropicConfig).length > 0) {
      logger.info({ config: anthropicConfig }, 'Applying custom Anthropic provider configuration');
      // In AI SDK v5, use createAnthropic for custom config
      const provider = createAnthropic(anthropicConfig);
      return provider(modelName);
    }

    return anthropic(modelName);
  }

  /**
   * Create an OpenAI model instance
   */
  private static createOpenAIModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    const openaiConfig: any = {};

    // Extract provider configuration (baseURL, etc.)
    // Note: API keys should be provided via environment variables, not in configuration

    if (providerOptions?.baseUrl || providerOptions?.baseURL) {
      openaiConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // Handle AI Gateway configuration if present
    if (providerOptions?.gateway) {
      logger.info({ gateway: providerOptions.gateway }, 'Setting up AI Gateway for OpenAI model');
      Object.assign(openaiConfig, providerOptions.gateway);
    }

    // For AI SDK v5, model parameters like temperature are passed to generateText/streamText,
    // not to the model constructor. Only provider config (apiKey, baseURL) goes to the provider.

    if (Object.keys(openaiConfig).length > 0) {
      logger.info({ config: openaiConfig }, 'Applying custom OpenAI provider configuration');
      // In AI SDK v5, use createOpenAI for custom config
      const provider = createOpenAI(openaiConfig);
      return provider(modelName);
    }

    return openai(modelName);
  }

  /**
   * Create an OpenRouter model instance
   * OpenRouter is OpenAI-compatible, so we use the OpenAI SDK with custom configuration
   */
  private static createOpenRouterModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    const openRouterConfig: any = {
      baseURL: 'https://openrouter.ai/api/v1',
    };

    // Extract provider configuration
    // Note: API keys should be provided via environment variables (OPENROUTER_API_KEY)

    if (providerOptions?.baseUrl || providerOptions?.baseURL) {
      openRouterConfig.baseURL = providerOptions.baseUrl || providerOptions.baseURL;
    }

    // OpenRouter expects API key in headers as: Authorization: Bearer YOUR_API_KEY
    // The OpenAI SDK will handle this if apiKey is provided
    if (providerOptions?.apiKey) {
      logger.warn(
        'API key detected in provider options for OpenRouter. Consider using OPENROUTER_API_KEY environment variable instead.'
      );
      openRouterConfig.apiKey = providerOptions.apiKey;
    } else if (process.env.OPENROUTER_API_KEY) {
      openRouterConfig.apiKey = process.env.OPENROUTER_API_KEY;
    }

    // Handle additional OpenRouter-specific headers if needed
    if (providerOptions?.headers) {
      openRouterConfig.headers = providerOptions.headers;
    }

    logger.info(
      { baseURL: openRouterConfig.baseURL, hasApiKey: !!openRouterConfig.apiKey },
      'Creating OpenRouter model'
    );

    // Use createOpenAI since OpenRouter is OpenAI-compatible
    const provider = createOpenAI(openRouterConfig);
    return provider(modelName);
  }

  /**
   * Create a custom provider model instance
   * This allows users to specify any OpenAI-compatible API endpoint
   */
  private static createCustomProviderModel(
    modelName: string,
    providerOptions?: Record<string, unknown>
  ): LanguageModel {
    if (!providerOptions?.baseUrl && !providerOptions?.baseURL) {
      throw new Error(
        'Custom provider requires a baseURL in providerOptions. Example: { baseURL: "https://api.custom-provider.com/v1" }'
      );
    }

    const customConfig: any = {
      baseURL: providerOptions.baseUrl || providerOptions.baseURL,
    };

    // Extract API key if provided (though we recommend environment variables)
    if (providerOptions?.apiKey) {
      logger.warn(
        'API key detected in provider options for custom provider. Consider using environment variables instead.'
      );
      customConfig.apiKey = providerOptions.apiKey;
    }

    // Handle custom headers if provided
    if (providerOptions?.headers) {
      customConfig.headers = providerOptions.headers;
    }

    // Handle compatibility mode if specified
    if (providerOptions?.compatibility) {
      customConfig.compatibility = providerOptions.compatibility;
    }

    logger.info(
      { 
        baseURL: customConfig.baseURL, 
        hasApiKey: !!customConfig.apiKey,
        hasHeaders: !!customConfig.headers 
      },
      'Creating custom provider model'
    );

    // Use createOpenAI for OpenAI-compatible APIs
    const provider = createOpenAI(customConfig);
    return provider(modelName);
  }

  /**
   * Get generation parameters from provider options
   * These are parameters that get passed to generateText/streamText calls
   */
  static getGenerationParams(providerOptions?: Record<string, unknown>): Record<string, unknown> {
    if (!providerOptions) {
      return {};
    }

    // Exclude provider config items (these go to createProvider, not generateText/streamText)
    // Also exclude maxDuration as it's handled separately for timeouts
    const excludedKeys = ['apiKey', 'baseURL', 'baseUrl', 'maxDuration'];

    // Return all config except excluded items
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(providerOptions)) {
      if (!excludedKeys.includes(key) && value !== undefined) {
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Prepare complete generation configuration from model settings
   * Returns model instance and generation parameters ready to spread into generateText/streamText
   * Includes maxDuration if specified in provider options (in seconds, following Vercel standard)
   */
  static prepareGenerationConfig(
    modelSettings?: ModelSettings
  ): { model: LanguageModel; maxDuration?: number } & Record<string, unknown> {
    const modelString = modelSettings?.model?.trim() || 'anthropic/claude-4-sonnet-20250514';

    // Create the model instance
    const model = ModelFactory.createModel({
      model: modelString,
      providerOptions: modelSettings?.providerOptions,
    });

    // Get generation parameters (excludes maxDuration)
    const generationParams = ModelFactory.getGenerationParams(modelSettings?.providerOptions);

    // Extract maxDuration if present (Vercel standard, in seconds)
    const maxDuration = modelSettings?.providerOptions?.maxDuration as number | undefined;

    return {
      model,
      ...generationParams,
      ...(maxDuration !== undefined && { maxDuration }),
    };
  }

  /**
   * Validate model settingsuration
   * Basic validation only - let AI SDK handle parameter-specific validation
   */
  static validateConfig(config: ModelSettings): string[] {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Model name is required');
    }

    // Validate provider options structure if present
    if (config.providerOptions) {
      // Security validation: Check for API keys in configuration (warn but allow for flexibility)
      if (config.providerOptions.apiKey) {
        logger.warn(
          'API keys detected in provider options. Consider using environment variables ' +
            '(ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY) or credential store instead.'
        );
      }

      // Validate maxDuration if present
      if (config.providerOptions.maxDuration !== undefined) {
        const maxDuration = config.providerOptions.maxDuration;
        if (typeof maxDuration !== 'number' || maxDuration <= 0) {
          errors.push('maxDuration must be a positive number (in seconds)');
        }
      }
    }

    return errors;
  }
}
