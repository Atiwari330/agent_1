/**
 * HubSpot Properties & Metadata - Atomic Tools
 *
 * Tools for fetching deal properties, pipelines, and stages.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getHubSpotClient, withErrorHandling } from './client.js';
import { logger } from '../../utils/logger.js';

/**
 * Tool: Get Deal Properties
 *
 * Get all available deal properties and their metadata.
 * Maps to: GET /crm/v3/properties/deals
 */
export const getDealProperties = tool({
  description:
    'Get all available HubSpot deal properties and their definitions. Returns property names, types, labels, and descriptions. Useful for understanding what fields are available on deals.',
  inputSchema: z.object({}),
  execute: async () => {
    logger.debug('Fetching deal properties');

    return withErrorHandling(async () => {
      const client = getHubSpotClient();

      const response = await client.crm.properties.coreApi.getAll('deals');

      return {
        properties: response.results.map((prop) => ({
          name: prop.name,
          label: prop.label,
          type: prop.type,
          fieldType: prop.fieldType,
          description: prop.description,
          groupName: prop.groupName,
          options: prop.options,
        })),
        total: response.results.length,
      };
    }, 'getDealProperties');
  },
});

/**
 * Tool: List Deal Stages
 *
 * Get all pipeline stages for deals.
 * Maps to: GET /crm/v3/pipelines/deals
 */
export const listDealStages = tool({
  description:
    'Get all deal pipelines and their stages. Returns pipeline names, stage IDs, stage labels, and metadata like win probability. Essential for understanding your sales process structure.',
  inputSchema: z.object({
    pipelineId: z
      .string()
      .optional()
      .describe(
        'Optional: Get stages for a specific pipeline ID (default: returns all pipelines)'
      ),
  }),
  execute: async ({ pipelineId }: any) => {
    logger.debug(`Fetching deal stages${pipelineId ? ` for pipeline: ${pipelineId}` : ''}`);

    return withErrorHandling(async () => {
      const client = getHubSpotClient();

      if (pipelineId) {
        // Get specific pipeline
        const response = await client.crm.pipelines.pipelinesApi.getById(
          'deals',
          pipelineId
        );

        return {
          pipelines: [
            {
              id: response.id,
              label: response.label,
              displayOrder: response.displayOrder,
              stages: response.stages.map((stage) => ({
                id: stage.id,
                label: stage.label,
                displayOrder: stage.displayOrder,
                metadata: stage.metadata,
              })),
            },
          ],
        };
      } else {
        // Get all pipelines
        const response = await client.crm.pipelines.pipelinesApi.getAll('deals');

        return {
          pipelines: response.results.map((pipeline) => ({
            id: pipeline.id,
            label: pipeline.label,
            displayOrder: pipeline.displayOrder,
            stages: pipeline.stages.map((stage) => ({
              id: stage.id,
              label: stage.label,
              displayOrder: stage.displayOrder,
              metadata: stage.metadata,
            })),
          })),
        };
      }
    }, 'listDealStages');
  },
});
