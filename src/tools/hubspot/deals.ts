/**
 * HubSpot Deals - Atomic Tools
 *
 * Each tool performs ONE HubSpot API call.
 * Following the atomic tool pattern from PRD.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getHubSpotClient, withErrorHandling, searchRateLimiter } from './client.js';
import { logger } from '../../utils/logger.js';

/**
 * Tool: Get Deal by ID
 *
 * Retrieves complete information about a specific deal.
 * Maps to: GET /crm/v3/objects/deals/{dealId}
 */
export const getDealById = tool({
  description:
    'Get detailed information about a specific HubSpot deal by its ID. Returns all deal properties including name, stage, amount, close date, pipeline, owner, and associated data.',
  inputSchema: z.object({
    dealId: z.string().describe('The HubSpot deal ID to retrieve'),
  }),
  execute: async ({ dealId }: any) => {
    logger.debug(`Fetching deal by ID: ${dealId}`);

    return withErrorHandling(async () => {
      const client = getHubSpotClient();

      const response = await client.crm.deals.basicApi.getById(dealId, [
        'dealname',
        'dealstage',
        'pipeline',
        'amount',
        'closedate',
        'hubspot_owner_id',
        'createdate',
        'hs_lastmodifieddate',
        'dealtype',
        'description',
        'hs_priority',
      ]);

      return {
        id: response.id,
        properties: response.properties,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
      };
    }, 'getDealById');
  },
});

/**
 * Tool: Search Deals
 *
 * Search for deals with filters (stage, pipeline, amount, etc.)
 * Maps to: POST /crm/v3/objects/deals/search
 */
export const searchDeals = tool({
  description:
    'Search for HubSpot deals using filters. Can filter by deal stage, pipeline, amount, close date, owner, and more. Returns matching deals with their properties.',
  inputSchema: z.object({
    stage: z
      .string()
      .optional()
      .describe(
        'Filter by deal stage (e.g., "appointmentscheduled", "qualifiedtobuy", "closedwon")'
      ),
    pipeline: z
      .string()
      .optional()
      .describe('Filter by pipeline ID (default: "default")'),
    minAmount: z
      .number()
      .optional()
      .describe('Minimum deal amount to filter by'),
    maxAmount: z
      .number()
      .optional()
      .describe('Maximum deal amount to filter by'),
    limit: z
      .number()
      .optional()
      .default(100)
      .describe('Maximum number of results to return (max 100)'),
  }),
  execute: async ({ stage, pipeline, minAmount, maxAmount, limit }: any) => {
    logger.debug(`Searching deals with filters: ${JSON.stringify({ stage, pipeline, minAmount, maxAmount })}`);

    return withErrorHandling(async () => {
      return searchRateLimiter.throttle(async () => {
        const client = getHubSpotClient();

        // Build filter groups
        const filters: any[] = [];

        if (stage) {
          filters.push({
            propertyName: 'dealstage',
            operator: 'EQ',
            value: stage,
          });
        }

        if (pipeline) {
          filters.push({
            propertyName: 'pipeline',
            operator: 'EQ',
            value: pipeline,
          });
        }

        if (minAmount !== undefined) {
          filters.push({
            propertyName: 'amount',
            operator: 'GTE',
            value: minAmount.toString(),
          });
        }

        if (maxAmount !== undefined) {
          filters.push({
            propertyName: 'amount',
            operator: 'LTE',
            value: maxAmount.toString(),
          });
        }

        const searchRequest: any = {
          filterGroups: filters.length > 0 ? [{ filters }] : [],
          properties: [
            'dealname',
            'dealstage',
            'pipeline',
            'amount',
            'closedate',
            'hubspot_owner_id',
            'createdate',
            'hs_lastmodifieddate',
          ],
          limit: Math.min(limit || 100, 100),
        };

        const response = await client.crm.deals.searchApi.doSearch(searchRequest);

        return {
          deals: response.results.map((deal) => ({
            id: deal.id,
            properties: deal.properties,
          })),
          total: response.total,
        };
      });
    }, 'searchDeals');
  },
});

/**
 * Tool: List All Deals
 *
 * List all deals with optional pagination.
 * Maps to: GET /crm/v3/objects/deals
 */
export const listDeals = tool({
  description:
    'List all HubSpot deals. Returns a paginated list of deals with their basic properties. Use this for getting an overview of all deals.',
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .default(100)
      .describe('Number of deals to return (max 100)'),
  }),
  execute: async ({ limit }: any) => {
    logger.debug(`Listing deals (limit: ${limit})`);

    return withErrorHandling(async () => {
      const client = getHubSpotClient();

      const response = await client.crm.deals.basicApi.getPage(
        Math.min(limit || 100, 100),
        undefined,
        [
          'dealname',
          'dealstage',
          'pipeline',
          'amount',
          'closedate',
          'hubspot_owner_id',
          'createdate',
        ]
      );

      return {
        deals: response.results.map((deal) => ({
          id: deal.id,
          properties: deal.properties,
        })),
        total: response.results.length,
      };
    }, 'listDeals');
  },
});

/**
 * Tool: Update Deal Stage
 *
 * Move a deal to a different pipeline stage.
 * Maps to: PATCH /crm/v3/objects/deals/{dealId}
 */
export const updateDealStage = tool({
  description:
    'Update the stage of a HubSpot deal. Use this to move deals through the pipeline (e.g., from "qualifiedtobuy" to "presentationscheduled").',
  inputSchema: z.object({
    dealId: z.string().describe('The ID of the deal to update'),
    newStage: z
      .string()
      .describe(
        'The new deal stage ID (e.g., "appointmentscheduled", "closedwon")'
      ),
  }),
  execute: async ({ dealId, newStage }: any) => {
    logger.debug(`Updating deal ${dealId} to stage: ${newStage}`);

    return withErrorHandling(async () => {
      const client = getHubSpotClient();

      const response = await client.crm.deals.basicApi.update(dealId, {
        properties: {
          dealstage: newStage,
        },
      });

      return {
        id: response.id,
        properties: response.properties,
        updatedAt: response.updatedAt,
      };
    }, 'updateDealStage');
  },
});
