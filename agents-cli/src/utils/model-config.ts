import inquirer from 'inquirer';

export interface ModelConfigurationResult {
  modelSettings: {
    base: {
      model: string;
    };
    structuredOutput?: {
      model: string;
    };
    summarizer?: {
      model: string;
    };
  };
}

export const defaultGeminiModelConfigurations = {
  base: {
    model: 'google/gemini-2.5-flash',
  },
  structuredOutput: {
    model: 'google/gemini-2.5-flash-lite',
  },
  summarizer: {
    model: 'google/gemini-2.5-flash-lite',
  },
};

export const defaultOpenRouterModelConfigurations = {
  base: {
    model: 'openrouter/anthropic/claude-sonnet-4',
  },
  structuredOutput: {
    model: 'openrouter/openai/gpt-4.1-mini',
  },
  summarizer: {
    model: 'openrouter/openai/gpt-4.1-nano',
  },
};

export const defaultOpenaiModelConfigurations = {
  base: {
    model: 'openai/gpt-5-2025-08-07',
  },
  structuredOutput: {
    model: 'openai/gpt-4.1-mini-2025-04-14',
  },
  summarizer: {
    model: 'openai/gpt-4.1-nano-2025-04-14',
  },
};

export const defaultAnthropicModelConfigurations = {
  base: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  structuredOutput: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
  summarizer: {
    model: 'anthropic/claude-sonnet-4-20250514',
  },
};

/**
 * Prompt user for model configuration (providers and model selection)
 * This is shared between init and push commands
 */
export async function promptForModelConfiguration(): Promise<ModelConfigurationResult> {
  // Provider selection
  const { providers } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'providers',
      message: 'Which AI providers would you like to configure?',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
        { name: 'Google (Gemini)', value: 'google' },
        { name: 'OpenRouter (Any model)', value: 'openrouter' },
        { name: 'Custom Provider', value: 'custom' },
      ],
      validate: (input: string[]) => {
        if (input.length === 0) {
          return 'Please select at least one provider';
        }
        return true;
      },
    },
  ]);

  // Available models for each provider (matching frontend options)
  const anthropicModels = [
    { name: 'Claude Opus 4.1', value: 'anthropic/claude-opus-4-1-20250805' },
    { name: 'Claude Sonnet 4', value: 'anthropic/claude-sonnet-4-20250514' },
    { name: 'Claude Haiku 3.5', value: 'anthropic/claude-3-5-haiku-20241022' },
  ];

  const openaiModels = [
    { name: 'GPT-5', value: 'openai/gpt-5-2025-08-07' },
    { name: 'GPT-5 Mini', value: 'openai/gpt-5-mini-2025-08-07' },
    { name: 'GPT-5 Nano', value: 'openai/gpt-5-nano-2025-08-07' },
    { name: 'GPT-4.1', value: 'openai/gpt-4.1-2025-04-14' },
    { name: 'GPT-4.1 Mini', value: 'openai/gpt-4.1-mini-2025-04-14' },
    { name: 'GPT-4.1 Nano', value: 'openai/gpt-4.1-nano-2025-04-14' },
  ];

  const googleModels = [
    { name: 'Gemini 2.5 Pro', value: 'google/gemini-2.5-pro' },
    { name: 'Gemini 2.5 Flash', value: 'google/gemini-2.5-flash' },
    { name: 'Gemini 2.5 Flash Lite', value: 'google/gemini-2.5-flash-lite' },
  ];

  // For OpenRouter, allow custom model input
  const getOpenRouterModels = async () => {
    const { useCustom } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'useCustom',
        message: 'Would you like to enter custom OpenRouter model names? (Otherwise use popular defaults)',
        default: false,
      },
    ]);

    if (useCustom) {
      const { customModels } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customModels',
          message: 'Enter OpenRouter model names (comma-separated, e.g., anthropic/claude-sonnet-4,openai/gpt-4.1-mini):',
          validate: (input: string) => {
            if (!input.trim()) return 'At least one model is required';
            return true;
          },
        },
      ]);
      
      return customModels.split(',').map((model: string) => ({
        name: `${model.trim()} (OpenRouter)`,
        value: `openrouter/${model.trim()}`,
      }));
    }

    // Popular OpenRouter models
    return [
      { name: 'Claude Sonnet 4 (OpenRouter)', value: 'openrouter/anthropic/claude-sonnet-4' },
      { name: 'GPT-4.1 Mini (OpenRouter)', value: 'openrouter/openai/gpt-4.1-mini' },
      { name: 'GPT-4.1 Nano (OpenRouter)', value: 'openrouter/openai/gpt-4.1-nano' },
    ];
  };

  // Collect all available models based on selected providers
  const availableModels = [];
  if (providers.includes('anthropic')) {
    availableModels.push(...anthropicModels);
  }
  if (providers.includes('openai')) {
    availableModels.push(...openaiModels);
  }
  if (providers.includes('google')) {
    availableModels.push(...googleModels);
  }
  if (providers.includes('openrouter')) {
    const openrouterModels = await getOpenRouterModels();
    availableModels.push(...openrouterModels);
  }
  if (providers.includes('custom')) {
    const { customModel } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customModel',
        message: 'Enter your custom model string (format: provider/model-name):',
        validate: (input: string) => {
          if (!input.trim()) return 'Model string is required';
          if (!input.includes('/')) return 'Format: provider/model-name';
          return true;
        },
      },
    ]);
    availableModels.push({ name: `Custom: ${customModel}`, value: customModel });
  }

  // Model selection for different use cases
  const modelAnswers = await inquirer.prompt([
    {
      type: 'list',
      name: 'baseModel',
      message: 'Select your default model for general tasks (required):',
      choices: availableModels,
    },
    {
      type: 'confirm',
      name: 'configureOptionalModels',
      message: 'Would you like to configure optional models for structured output and summaries?',
      default: false,
    },
  ]);

  let optionalModels: any = {};
  if (modelAnswers.configureOptionalModels) {
    const optionalChoices = [...availableModels, { name: 'Use base model', value: null }];

    optionalModels = await inquirer.prompt([
      {
        type: 'list',
        name: 'structuredOutputModel',
        message: 'Select your model for structured output tasks (or use base model):',
        choices: optionalChoices,
      },
      {
        type: 'list',
        name: 'summarizerModel',
        message: 'Select your model for summaries and quick tasks (or use base model):',
        choices: optionalChoices,
      },
    ]);
  }

  // Build model settings object
  const modelSettings: any = {
    base: {
      model: modelAnswers.baseModel,
    },
  };

  // Add optional models only if they were configured
  if (optionalModels.structuredOutputModel) {
    modelSettings.structuredOutput = {
      model: optionalModels.structuredOutputModel,
    };
  }

  if (optionalModels.summarizerModel) {
    modelSettings.summarizer = {
      model: optionalModels.summarizerModel,
    };
  }

  return { modelSettings };
}
