/**
 * Mock Tools for Testing
 *
 * Demonstrates atomic tool pattern and validates agent orchestration.
 * These will be replaced with real HubSpot tools in Phase 2.
 */

import { tool } from 'ai';
import { z } from 'zod';

/**
 * Mock deal database
 */
const mockDeals = {
  '123': {
    id: '123',
    name: 'Acme Corp - Enterprise Plan',
    stage: 'negotiation',
    pipeline: 'Sales Pipeline',
    amount: 50000,
    currency: 'USD',
    closeDate: '2025-12-15',
    owner: 'Adi Tiwari',
    company: 'Acme Corp',
    contacts: ['john@acme.com', 'sarah@acme.com'],
    lastActivity: '2025-10-28',
  },
  '456': {
    id: '456',
    name: 'TechStart - Starter Plan',
    stage: 'closed-won',
    pipeline: 'Sales Pipeline',
    amount: 5000,
    currency: 'USD',
    closeDate: '2025-10-01',
    owner: 'Adi Tiwari',
    company: 'TechStart Inc',
    contacts: ['mike@techstart.io'],
    lastActivity: '2025-10-30',
  },
  '789': {
    id: '789',
    name: 'GlobalTech - Professional Plan',
    stage: 'proposal',
    pipeline: 'Sales Pipeline',
    amount: 25000,
    currency: 'USD',
    closeDate: '2025-11-20',
    owner: 'Adi Tiwari',
    company: 'GlobalTech Solutions',
    contacts: ['emma@globaltech.com'],
    lastActivity: '2025-10-29',
  },
};

/**
 * Mock Tool: Get Deal by ID
 *
 * Simulates HubSpot's getDeal API call.
 * Demonstrates: single API call, parameter validation, error handling.
 */
export const getDealById = tool({
  description: 'Get detailed information about a specific deal by its ID. Returns all deal properties including name, stage, amount, contacts, and recent activity.',
  parameters: z.object({
    dealId: z.string().describe('The HubSpot deal ID to retrieve'),
  }),
  execute: async ({ dealId }: any) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    const deal = mockDeals[dealId as keyof typeof mockDeals];

    if (!deal) {
      throw new Error(`Deal with ID ${dealId} not found`);
    }

    return deal;
  },
});

/**
 * Mock Tool: List All Deals
 *
 * Simulates HubSpot's searchDeals API call.
 * Demonstrates: list operation, no parameters.
 */
export const listDeals = tool({
  description: 'List all available deals. Returns an array of deal summaries with ID, name, stage, and amount.',
  parameters: z.object({}),
  execute: async () => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const dealList = Object.values(mockDeals).map((deal) => ({
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      amount: deal.amount,
      company: deal.company,
    }));

    return {
      deals: dealList,
      total: dealList.length,
    };
  },
});

/**
 * Mock Tool: Search Deals by Stage
 *
 * Simulates HubSpot's filtered search.
 * Demonstrates: parameter-based filtering.
 */
export const searchDealsByStage = tool({
  description: 'Search for deals in a specific pipeline stage. Useful for finding deals in negotiation, proposal, or closed-won stages.',
  parameters: z.object({
    stage: z.string().describe('The deal stage to filter by (e.g., negotiation, proposal, closed-won)'),
  }),
  execute: async ({ stage }: any) => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 400));

    const filteredDeals = Object.values(mockDeals)
      .filter((deal) => deal.stage.toLowerCase() === stage.toLowerCase())
      .map((deal) => ({
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        amount: deal.amount,
        company: deal.company,
        closeDate: deal.closeDate,
      }));

    return {
      deals: filteredDeals,
      total: filteredDeals.length,
      stage: stage,
    };
  },
});

/**
 * Mock Tool: Get Deal Summary
 *
 * Simulates a higher-level operation that could be done with agent orchestration.
 * This demonstrates what NOT to do - this should be agent logic, not a tool.
 * Included for testing purposes only.
 */
export const getDealSummary = tool({
  description: 'Get a quick summary of a deal including key metrics and status. This is a mock tool demonstrating a non-atomic operation.',
  parameters: z.object({
    dealId: z.string().describe('The deal ID to summarize'),
  }),
  execute: async ({ dealId }: any) => {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const deal = mockDeals[dealId as keyof typeof mockDeals];

    if (!deal) {
      throw new Error(`Deal ${dealId} not found`);
    }

    const summary = {
      id: deal.id,
      name: deal.name,
      status: deal.stage === 'closed-won' ? 'Won' : deal.stage === 'closed-lost' ? 'Lost' : 'Open',
      value: `$${deal.amount.toLocaleString()} ${deal.currency}`,
      company: deal.company,
      daysUntilClose: Math.ceil(
        (new Date(deal.closeDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      ),
      contactCount: deal.contacts.length,
    };

    return summary;
  },
});
