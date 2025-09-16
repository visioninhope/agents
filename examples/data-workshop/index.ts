import { project } from '@inkeep/agents-sdk';
import { dataWorkshopGraph } from './data-workshop.graph';

/**
 * DATA WORKSHOP PROJECT
 *
 * This project demonstrates various function tools for data processing, calculations, and utilities.
 *
 * USAGE PROMPTS TO TRY:
 * - "What's the weather in New York?"
 * - "Tell me a programming joke"
 * - "Calculate compound interest for $1000 at 5% for 10 years"
 * - "Generate a secure password with 16 characters"
 * - "Analyze this text: 'I love this amazing product!'"
 * - "Convert $100 from USD to EUR"
 * - "Generate a QR code for 'https://example.com'"
 * - "Hash the text 'hello world' using SHA256"
 * - "Calculate my age if I was born on 1990-05-15"
 * - "Generate a UUID"
 * - "Format 1234567.89 as currency"
 *
 * Each tool is designed to be easily invoked and provides clear, useful results.
 */

export const dataWorkshopProject = project({
  id: 'data-workshop',
  name: 'data-workshop',
  description: 'A comprehensive data processing workshop with various utility tools',
  graphs: () => [dataWorkshopGraph],
  models: {
    base: { model: 'anthropic/claude-4-sonnet-20250514' },
    structuredOutput: { model: 'openai/gpt-4o-mini-2024-07-18' },
    summarizer: { model: 'openai/gpt-4o-mini-2024-07-18' },
  },
});
