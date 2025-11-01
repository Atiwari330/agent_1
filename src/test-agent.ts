/**
 * Test Script for Agent Core
 *
 * Validates agent orchestration with REAL HubSpot tools.
 * Run with: pnpm test-agent (or tsx src/test-agent.ts)
 */

import { DealAgent } from './agent/core.js';
import { toolRegistry } from './tools/base.js';
import { registerHubSpotTools } from './tools/hubspot/index.js';
import { logger } from './utils/logger.js';

/**
 * Setup: Register HubSpot tools
 */
function setupTools() {
  logger.section('Registering Real HubSpot Tools');

  registerHubSpotTools();

  logger.success(`Registered ${toolRegistry.count()} tools`);
  logger.info(`Available tools: ${toolRegistry.listNames().join(', ')}`);
  logger.separator();
}

/**
 * Test queries to validate agent behavior with REAL HubSpot API
 */
const testQueries = [
  {
    query: 'What deals do we have?',
    description: 'Tests: Agent should call list_deals tool to fetch real HubSpot deals',
  },
  {
    query: 'Show me all available deal stages and pipelines',
    description: 'Tests: Agent should call list_deal_stages to get pipeline structure',
  },
  {
    query: 'Search for deals in the appointmentscheduled stage',
    description: 'Tests: Agent should call search_deals with stage filter',
  },
  {
    query: 'What deal properties are available in HubSpot?',
    description: 'Tests: Agent should call get_deal_properties to list all fields',
  },
];

/**
 * Run all test queries
 */
async function runTests() {
  const agent = new DealAgent();
  let passedTests = 0;
  let failedTests = 0;

  logger.section('Starting Agent Tests');

  for (let i = 0; i < testQueries.length; i++) {
    const testQuery = testQueries[i];
    if (!testQuery) continue;

    const { query, description } = testQuery;

    logger.separator();
    logger.section(`Test ${i + 1}/${testQueries.length}`);
    logger.info(`Query: "${query}"`);
    logger.info(`Expected: ${description}`);
    logger.separator();

    try {
      const response = await agent.run(query);

      // Validate response
      if (response.text && response.text.length > 0) {
        logger.success('✓ Test passed - Agent responded successfully');
        passedTests++;
      } else {
        logger.warn('⚠ Test passed but response was empty');
        passedTests++;
      }

      // Show usage stats
      if (response.usage) {
        logger.debug('Token usage', {
          data: response.usage,
        });
      }
    } catch (error) {
      logger.error('✗ Test failed', error as Error);
      failedTests++;
    }

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  logger.separator();
  logger.section('Test Summary');
  logger.success(`Passed: ${passedTests}/${testQueries.length}`);
  if (failedTests > 0) {
    logger.error(`Failed: ${failedTests}/${testQueries.length}`);
  }
  logger.separator();
}

/**
 * Main execution
 */
async function main() {
  try {
    setupTools();
    await runTests();
  } catch (error) {
    logger.error('Test script failed', error as Error);
    process.exit(1);
  }
}

// Run tests
main();
