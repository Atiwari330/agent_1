/**
 * Agent Core
 *
 * Main agent orchestration using Vercel AI SDK 5.x.
 * Handles tool calling, conversation management, and execution control.
 *
 * Architecture: Agent decides HOW to accomplish goals by selecting
 * and orchestrating atomic tools.
 */

import { generateText, CoreMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { toolRegistry } from '../tools/base.js';

/**
 * Configuration for agent behavior
 */
export interface AgentConfig {
  systemPrompt?: string;
  model?: string;
  maxSteps?: number;
  temperature?: number;
}

/**
 * Agent response containing text and metadata
 */
export interface AgentResponse {
  text: string;
  toolCalls: any[];
  finishReason: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Deal Agent - Orchestrates tools to accomplish deal management tasks
 */
export class DealAgent {
  private systemPrompt: string;
  private model: string;
  private maxSteps: number;
  private temperature: number;
  private conversationHistory: CoreMessage[] = [];

  constructor(agentConfig: AgentConfig = {}) {
    this.systemPrompt = agentConfig.systemPrompt || this.getDefaultSystemPrompt();
    this.model = agentConfig.model || 'gpt-4o'; // Will use GPT-5 when available
    this.maxSteps = agentConfig.maxSteps || config.agent.maxIterations;
    this.temperature = agentConfig.temperature || 0.7;

    logger.debug('Agent initialized', {
      data: {
        model: this.model,
        maxSteps: this.maxSteps,
        temperature: this.temperature,
        toolCount: toolRegistry.count(),
      },
    });
  }

  /**
   * Default system prompt defining agent capabilities
   * This will be enhanced with skills in Phase 4
   */
  private getDefaultSystemPrompt(): string {
    const toolList = toolRegistry.listNames().join(', ');

    return `You are a Deal Management AI Assistant specialized in helping with CRM operations.

# Your Role
You help users manage their deals by accessing data from HubSpot, Gmail, Google Drive, and Asana.
You have access to atomic tools that you can orchestrate to accomplish complex tasks.

# Available Tools
You have access to these tools: ${toolList || 'none yet (in development)'}

# Principles
1. **Be Transparent**: Always cite your sources (e.g., "According to HubSpot...")
2. **Use Tools Wisely**: Call tools when you need data, don't make assumptions
3. **Handle Errors Gracefully**: If a tool fails, explain what went wrong
4. **Be Concise**: Provide clear, actionable responses
5. **Adapt Your Approach**: Use discoveries from one tool to inform next steps

# Behavior
- Call tools in sequence as needed (you're not limited to one)
- If you don't have enough information, ask the user for clarification
- Summarize findings in a clear, structured way
- When showing deal data, highlight key information (stage, value, contacts)

# Current Capabilities
Right now, you're in early development. More tools will be added soon.
Focus on demonstrating intelligent tool orchestration with available tools.`;
  }

  /**
   * Run the agent with a user message
   *
   * @param userMessage - The user's natural language query
   * @param includeHistory - Whether to include conversation history (default: false)
   * @returns Agent response with text and metadata
   */
  async run(userMessage: string, includeHistory: boolean = false): Promise<AgentResponse> {
    logger.section('Agent Execution');
    logger.info(`User: ${userMessage}`);

    // Get all available tools
    const tools = toolRegistry.getAll();
    const toolCount = Object.keys(tools).length;

    if (toolCount === 0) {
      logger.warn('No tools registered! Agent will run without tools.');
    } else {
      logger.debug(`Agent has access to ${toolCount} tools: ${toolRegistry.listNames().join(', ')}`);
    }

    try {
      // Build messages array
      const messages: CoreMessage[] = includeHistory
        ? [...this.conversationHistory, { role: 'user', content: userMessage }]
        : [{ role: 'user', content: userMessage }];

      // Execute agent with Vercel AI SDK
      const result = await generateText({
        model: openai(this.model),
        system: this.systemPrompt,
        messages,
        tools: tools,
        temperature: this.temperature,

        // Log each step as it completes
        onStepFinish: ({ text, toolCalls, toolResults }) => {
          // Log tool calls
          if (toolCalls && toolCalls.length > 0) {
            toolCalls.forEach((call: any) => {
              logger.toolCall(call.toolName, call.arguments);
            });
          }

          // Log tool results
          if (toolResults && toolResults.length > 0) {
            toolResults.forEach((result: any) => {
              const success = result && !result.error;
              const executionTime = result?.metadata?.executionTime;
              logger.toolResult(result.toolName || 'unknown', success, executionTime);

              if (config.app.debug) {
                logger.toolResultData(result);
              }
            });
          }

          // Log intermediate thinking
          if (text && config.app.debug) {
            logger.agentThinking(text);
          }
        },
      });

      // Log final response
      logger.separator();
      logger.agentResponse(result.text);
      logger.debug('Execution complete', {
        data: {
          finishReason: result.finishReason,
          toolCalls: result.steps?.length || 0,
          usage: result.usage,
        },
      });

      // Update conversation history
      if (includeHistory) {
        this.conversationHistory.push(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: result.text }
        );
      }

      const usage: any = result.usage;
      return {
        text: result.text,
        toolCalls: result.steps || [],
        finishReason: result.finishReason,
        usage: {
          promptTokens: usage.promptTokens || 0,
          completionTokens: usage.completionTokens || 0,
          totalTokens: usage.totalTokens || 0,
        },
      };
    } catch (error) {
      logger.error('Agent execution failed', error as Error);
      throw error;
    }
  }

  /**
   * Update the system prompt (for testing or customization)
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    logger.debug('System prompt updated');
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    logger.debug('Conversation history cleared');
  }

  /**
   * Get current conversation history
   */
  getHistory(): CoreMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return {
      systemPrompt: this.systemPrompt,
      model: this.model,
      maxSteps: this.maxSteps,
      temperature: this.temperature,
    };
  }
}

/**
 * Create a default agent instance
 * Use this for quick testing
 */
export function createAgent(config?: AgentConfig): DealAgent {
  return new DealAgent(config);
}
