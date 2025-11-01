/**
 * Tool Definition Base System
 *
 * Provides foundational types and utilities for creating atomic tools.
 * All HubSpot, Gmail, Drive, and Asana tools will use these patterns.
 *
 * Architecture Principle: One tool = one API call or operation
 */

/**
 * Standard tool result format
 * All tools should return this structure for consistency
 */
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    timestamp: Date;
    executionTime?: number;
    source?: string;
  };
}

/**
 * Tool registry to manage all available tools
 *
 * Usage:
 *   toolRegistry.register('get_deal', getDealTool);
 *   const allTools = toolRegistry.getAll(); // For AI SDK
 */
export class ToolRegistry {
  private tools: Map<string, any>;

  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a tool in the registry
   * @throws Error if tool name already exists
   */
  register(name: string, tool: any): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }
    this.tools.set(name, tool);
  }

  /**
   * Register multiple tools at once
   */
  registerMany(tools: Record<string, any>): void {
    for (const [name, tool] of Object.entries(tools)) {
      this.register(name, tool);
    }
  }

  /**
   * Get a specific tool by name
   */
  get(name: string): any | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools as an object (format required by Vercel AI SDK)
   */
  getAll(): Record<string, any> {
    return Object.fromEntries(Array.from(this.tools.entries()));
  }

  /**
   * List all registered tool names
   */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get total tool count
   */
  count(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Clear all tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

/**
 * Global tool registry instance
 * Use this singleton throughout the application
 */
export const toolRegistry = new ToolRegistry();

/**
 * Helper to format successful tool results
 *
 * @param data - The data to return
 * @param source - Optional source identifier (e.g., 'HubSpot', 'Gmail')
 * @returns Formatted success result
 */
export function successResult<T>(data: T, source?: string): ToolResult<T> {
  return {
    success: true,
    data,
    metadata: {
      timestamp: new Date(),
      source,
    },
  };
}

/**
 * Helper to format error tool results
 *
 * @param error - Error message or Error object
 * @param source - Optional source identifier
 * @returns Formatted error result
 */
export function errorResult(error: string | Error, source?: string): ToolResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : error,
    metadata: {
      timestamp: new Date(),
      source,
    },
  };
}

/**
 * Execution wrapper that adds timing and error handling
 *
 * Wraps any async function to:
 * - Track execution time
 * - Catch and format errors
 * - Add metadata
 *
 * @param fn - The async function to execute
 * @param source - Source identifier for the tool
 * @returns Promise resolving to ToolResult
 */
export async function wrapToolExecution<T>(
  fn: () => Promise<T>,
  source: string
): Promise<ToolResult<T>> {
  const startTime = Date.now();
  try {
    const data = await fn();
    const executionTime = Date.now() - startTime;
    return {
      success: true,
      data,
      metadata: {
        timestamp: new Date(),
        executionTime,
        source,
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        timestamp: new Date(),
        executionTime,
        source,
      },
    };
  }
}

/**
 * Type guard to check if a result is successful
 */
export function isSuccess<T>(result: ToolResult<T>): result is ToolResult<T> & { data: T } {
  return result.success && result.data !== undefined;
}

/**
 * Type guard to check if a result is an error
 */
export function isError(result: ToolResult): result is ToolResult & { error: string } {
  return !result.success && result.error !== undefined;
}
