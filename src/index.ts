/**
 * Deal Agent - Main Package Export
 *
 * Exports HubSpot tools for use in other applications (e.g., AI ChatBot)
 */

export {
  // HubSpot Deal Tools
  getDealById,
  searchDeals,
  listDeals,
  updateDealStage,
  // HubSpot Property/Metadata Tools
  getDealProperties,
  listDealStages,
  // Combined export
  hubspotTools,
  registerHubSpotTools,
} from './tools/hubspot/index.js';

// Export types if needed
export type { ToolRegistry } from './tools/base.js';
