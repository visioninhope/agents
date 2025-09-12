import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const _nodeEnvSchema = z.enum(['development', 'production']).default('development');
const environmentSchema = z.enum(['development', 'pentest', 'production', 'test']);

const criticalEnv = z
  .object({
    ENVIRONMENT: environmentSchema,
  })
  .parse(process.env);

const loadEnvFile = () => {
  // Priority of environment variables:
  // 1. Existing process.env variables (highest priority)
  // 2. Values from .env.{nodeEnv}.nonsecret file (lower priority)
  // 3. Default values defined in schema (lowest priority)

  const envPath = path.resolve(process.cwd(), `.env.${criticalEnv.ENVIRONMENT}.nonsecret`);

  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      // Only set if the environment variable doesn't already exist
      // This preserves any values that were already set in process.env
      if (!(k in process.env)) {
        process.env[k] = envConfig[k];
      }
    }
  }
};

loadEnvFile();
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  ENVIRONMENT: z
    .enum(['development', 'production', 'pentest', 'test'])
    .optional()
    .default('development'),
  DB_FILE_NAME: z.string().default('file:../local.db'),
  PORT: z.coerce.number().optional().default(3003),
  AGENT_BASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional().default('debug'),
  NANGO_SECRET_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string(),
  INKEEP_AGENTS_RUN_API_BYPASS_SECRET: z.string().optional(),
  OTEL_MAX_EXPORT_BATCH_SIZE: z.coerce.number().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default('http://localhost:14318/v1/traces'),
  INKEEP_TRACE_BAGGAGE_TAG_KEYS: z.string().optional().default('conversation.id,project.id,graph.id,tenant.id'),
});

const parseEnv = () => {
  try {
    const parsedEnv = envSchema.parse(process.env);

    // Set default AGENT_BASE_URL if not provided
    if (!parsedEnv.AGENT_BASE_URL) {
      parsedEnv.AGENT_BASE_URL = `http://localhost:${parsedEnv.PORT}`;
    }

    return parsedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map((issue) => issue.path.join('.'));
      throw new Error(
        `❌ Invalid environment variables: ${missingVars.join(', ')}\n${error.message}`
      );
    }
    throw error;
  }
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
