/**
 * HubSpot Tools - Main Export
 *
 * Exports all HubSpot atomic tools and registers them with the tool registry.
 */

import {
  getDealById,
  searchDeals,
  listDeals,
  updateDealStage,
} from './deals.js';
import { getDealProperties, listDealStages } from './properties.js';
import { toolRegistry } from '../base.js';
import { logger } from '../../utils/logger.js';

/**
 * All HubSpot tools
 */
export const hubspotTools = {
  get_deal_by_id: getDealById,
  search_deals: searchDeals,
  list_deals: listDeals,
  update_deal_stage: updateDealStage,
  get_deal_properties: getDealProperties,
  list_deal_stages: listDealStages,
};

/**
 * Register all HubSpot tools with the global tool registry
 */
export function registerHubSpotTools() {
  logger.info('Registering HubSpot tools...');

  toolRegistry.register('get_deal_by_id', hubspotTools.get_deal_by_id);
  toolRegistry.register('search_deals', hubspotTools.search_deals);
  toolRegistry.register('list_deals', hubspotTools.list_deals);
  toolRegistry.register('update_deal_stage', hubspotTools.update_deal_stage);
  toolRegistry.register('get_deal_properties', hubspotTools.get_deal_properties);
  toolRegistry.register('list_deal_stages', hubspotTools.list_deal_stages);

  logger.success(`Registered ${Object.keys(hubspotTools).length} HubSpot tools`);
}

/**
 * Export individual tools
 */
export {
  getDealById,
  searchDeals,
  listDeals,
  updateDealStage,
  getDealProperties,
  listDealStages,
};
