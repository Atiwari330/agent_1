/**
 * Configuration Module
 *
 * Loads and validates environment variables from .env file.
 * Provides type-safe access to configuration values.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

// Check if .env exists
if (!existsSync(envPath)) {
  console.error(
    '❌ Error: .env file not found!\n\n' +
    'Please create a .env file by copying .env.example:\n' +
    '  cp .env.example .env\n\n' +
    'Then fill in your API credentials.'
  );
  process.exit(1);
}

// Load environment variables
dotenv.config({ path: envPath });

/**
 * Configuration interface defining all app settings
 */
interface Config {
  openai: {
    apiKey: string;
  };
  hubspot: {
    accessToken: string;
  };
  app: {
    nodeEnv: 'development' | 'production';
    debug: boolean;
  };
  agent: {
    maxIterations: number;
    timeoutSeconds: number;
  };
}

/**
 * Gets required environment variable or throws error
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `❌ Missing required environment variable: ${key}\n\n` +
      `Please add ${key} to your .env file.\n` +
      `See .env.example for reference.`
    );
  }
  return value;
}

/**
 * Gets optional environment variable with default fallback
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Application configuration object
 * All required variables are validated at load time
 */
export const config: Config = {
  openai: {
    apiKey: getRequiredEnv('OPENAI_API_KEY'),
  },
  hubspot: {
    accessToken: getRequiredEnv('HUBSPOT_ACCESS_TOKEN'),
  },
  app: {
    nodeEnv: (getOptionalEnv('NODE_ENV', 'development') as 'development' | 'production'),
    debug: getOptionalEnv('DEBUG', 'false') === 'true',
  },
  agent: {
    maxIterations: parseInt(getOptionalEnv('AGENT_MAX_ITERATIONS', '10'), 10),
    timeoutSeconds: parseInt(getOptionalEnv('AGENT_TIMEOUT_SECONDS', '30'), 10),
  },
};

/**
 * Validation: Check credential formats
 */

// Validate HubSpot token format
if (!config.hubspot.accessToken.startsWith('pat-')) {
  console.warn(
    '⚠️  Warning: HubSpot access token should start with "pat-"\n' +
    '   Make sure you\'re using a Private App Access Token.\n' +
    '   Get one from: Settings → Integrations → Private Apps\n'
  );
}

// Validate OpenAI key format
if (!config.openai.apiKey.startsWith('sk-')) {
  console.warn(
    '⚠️  Warning: OpenAI API key should start with "sk-"\n' +
    '   Make sure you\'re using a valid API key.\n' +
    '   Get one from: https://platform.openai.com/api-keys\n'
  );
}

// Log successful config load in debug mode
if (config.app.debug) {
  console.log('✅ Configuration loaded successfully');
  console.log(`   Environment: ${config.app.nodeEnv}`);
  console.log(`   Debug mode: ${config.app.debug}`);
  console.log(`   Max iterations: ${config.agent.maxIterations}`);
  console.log(`   Timeout: ${config.agent.timeoutSeconds}s`);
}

/**
 * Helper function to validate HubSpot connection
 * This will be called by the CLI init command
 */
export async function validateHubSpotConnection(): Promise<boolean> {
  try {
    const { Client } = await import('@hubspot/api-client');
    const hubspotClient = new Client({ accessToken: config.hubspot.accessToken });

    // Try to fetch account info to validate token
    await hubspotClient.apiRequest({
      method: 'GET',
      path: '/account-info/v3/api-usage/daily',
    });

    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`HubSpot connection failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Helper function to validate OpenAI connection
 */
export async function validateOpenAIConnection(): Promise<boolean> {
  try {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: config.openai.apiKey });

    // Try to list models to validate key
    await openai.models.list();

    return true;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI connection failed: ${error.message}`);
    }
    throw error;
  }
}
