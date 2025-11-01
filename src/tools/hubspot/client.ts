/**
 * HubSpot API Client Wrapper
 *
 * Provides a clean interface to the HubSpot API with:
 * - Authentication handling
 * - Rate limiting (5 req/sec for search API)
 * - Error handling
 * - Type safety
 */

import { Client } from '@hubspot/api-client';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Singleton HubSpot client instance
 */
let hubspotClient: Client | null = null;

/**
 * Get or create HubSpot client
 */
export function getHubSpotClient(): Client {
  if (!hubspotClient) {
    hubspotClient = new Client({
      accessToken: config.hubspot.accessToken,
    });
    logger.debug('HubSpot client initialized');
  }
  return hubspotClient;
}

/**
 * Rate limiter for HubSpot Search API (5 req/sec limit)
 */
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestsPerSecond: number;
  private lastRequestTime = 0;

  constructor(requestsPerSecond: number = 4) {
    // Use 4 req/sec to stay safely under 5 req/sec limit
    this.requestsPerSecond = requestsPerSecond;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const minInterval = 1000 / this.requestsPerSecond;

      if (timeSinceLastRequest < minInterval) {
        await new Promise((resolve) =>
          setTimeout(resolve, minInterval - timeSinceLastRequest)
        );
      }

      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestTime = Date.now();
        await fn();
      }
    }

    this.processing = false;
  }
}

/**
 * Global rate limiter for search API calls
 */
export const searchRateLimiter = new RateLimiter(4);

/**
 * HubSpot API error wrapper
 */
export class HubSpotAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public hubspotError?: any
  ) {
    super(message);
    this.name = 'HubSpotAPIError';
  }
}

/**
 * Wrap HubSpot API calls with error handling
 */
export async function withErrorHandling<T>(
  apiCall: () => Promise<T>,
  operation: string
): Promise<T> {
  try {
    return await apiCall();
  } catch (error: any) {
    logger.error(`HubSpot API Error (${operation})`, error);

    // Handle HubSpot-specific errors
    if (error.response) {
      const status = error.response.status;
      const body = error.response.body;

      if (status === 401) {
        throw new HubSpotAPIError(
          'Authentication failed. Check your HubSpot access token.',
          401,
          body
        );
      }

      if (status === 429) {
        throw new HubSpotAPIError(
          'Rate limit exceeded. Please wait and try again.',
          429,
          body
        );
      }

      if (status === 404) {
        throw new HubSpotAPIError(
          'Resource not found. The deal or resource may not exist.',
          404,
          body
        );
      }

      throw new HubSpotAPIError(
        body?.message || 'HubSpot API request failed',
        status,
        body
      );
    }

    // Generic error
    throw new HubSpotAPIError(
      error.message || 'An unknown error occurred with HubSpot API'
    );
  }
}
