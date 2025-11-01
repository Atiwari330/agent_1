# 🧠 Product Requirements Document (PRD) v2.0

**Project:** Deal Agent Framework (Agentic Workflow for Personal Deal Management)  
**Author:** Adi Tiwari  
**Version:** v2.0 - Implementation-Ready Architecture  
**Date:** October 31, 2025  
**Last Updated:** October 31, 2025

---

## Table of Contents

1. [Purpose & Vision](#1-purpose--vision)
2. [Core Concept](#2-core-concept)
3. [Primary Goals (MVP)](#3-primary-goals-mvp)
4. [Architecture Philosophy](#4-architecture-philosophy)
5. [Tool Architecture: The Three-Tier Model](#5-tool-architecture-the-three-tier-model)
6. [Technical Implementation with Vercel AI SDK](#6-technical-implementation-with-vercel-ai-sdk)
7. [Deal Object Schema](#7-deal-object-schema)
8. [System Architecture](#8-system-architecture)
9. [CLI Implementation](#9-cli-implementation)
10. [Integration Specifications](#10-integration-specifications)
11. [Technical Stack](#11-technical-stack)
12. [Development Roadmap](#12-development-roadmap)
13. [Success Criteria](#13-success-criteria)
14. [Appendix A: Code Examples](#14-appendix-a-code-examples)
15. [Appendix B: Tool Patterns](#15-appendix-b-tool-patterns)

---

## 1. Purpose & Vision

The **Deal Agent Framework** is an AI-driven agentic system designed to unify fragmented data across multiple systems (HubSpot, Google Drive, Gmail, Asana) around a single **Deal ID**. 

Unlike traditional automation, this system provides an **autonomous agent** that:
- **Reasons** across data sources to answer complex questions
- **Plans** multi-step operations to accomplish goals
- **Adapts** its approach based on what it discovers
- **Maintains** context across interactions

### Vision Statement

Create a **self-aware workspace per deal** where the agent independently knows:
- Who the customer is and their full context
- What the deal status is across all systems
- What's happened recently (calls, emails, updates)
- What actions to take next (follow-ups, updates, alerts)

The agent should feel like an intelligent assistant that "just gets it" rather than a rigid automation tool.

---

## 2. Core Concept

### The Deal-Centric Data Model

Each **Deal** becomes a unified entity with connections to:

| System | Connection | Purpose |
|--------|-----------|---------|
| **HubSpot** | Deal ID | CRM record, properties, stage, value, contacts |
| **Google Drive** | Folder ID | Artifacts repository (quotes, PDFs, transcripts, spreadsheets) |
| **Gmail** | Contact emails | Communication threads and history |
| **Asana** | Project/Task IDs | Operational status tracking and task management |

These connections are stored in **Supabase** as a Deal Object, providing the agent with a unified data access layer.

### Why This Matters

Currently, deal information is siloed:
- HubSpot knows deal stage but not what was discussed in last call
- Gmail has email threads but doesn't know deal context
- Google Drive has documents but no connection to deal status
- Asana has tasks but doesn't reflect email conversations

The agent bridges these gaps by maintaining unified context.

---

## 3. Primary Goals (MVP)

| Priority | Goal | Success Metric |
|----------|------|----------------|
| **P0** | Unified Context | Agent can access all 4 systems for a single deal seamlessly |
| **P0** | Autonomous Tool Use | Agent selects and sequences tools without hardcoded workflows |
| **P0** | CLI Interface | Functional command-line interface for core skills |
| **P1** | Natural Language Skills | Agent understands requests like "what's the deal status?" |
| **P1** | Context Awareness | Agent maintains conversation history and deal context |
| **P2** | Expandability | Adding new tools requires < 50 lines of code |

---

## 4. Architecture Philosophy

### Core Principle: Agent-Orchestrated, Not Workflow-Driven

**Traditional Approach (What We're NOT Building):**
```javascript
// Hardcoded workflow - agent just executes steps
async function generateStatusReport(dealId) {
  const deal = await hubspot.getDeal(dealId);
  const emails = await gmail.getThreads(deal.contacts);
  const files = await drive.listFiles(deal.folderId);
  const tasks = await asana.getTasks(deal.projectId);
  return formatReport({ deal, emails, files, tasks });
}
```

**Agent-Driven Approach (What We're Building):**
```javascript
// Agent decides HOW to accomplish the goal
const agent = new ToolLoopAgent({
  model: 'gpt-5',
  systemPrompt: `You can generate status reports by:
    1. Getting deal info from HubSpot
    2. Checking recent emails for the deal contacts
    3. Looking at recent files in the Drive folder
    4. Checking Asana for task status
    Use your tools to gather this info and create a summary.`,
  tools: {
    get_hubspot_deal,
    search_gmail,
    list_drive_files,
    get_asana_tasks
  }
});

// Agent orchestrates the sequence based on what it finds
await agent.run("Generate a status report for deal XYZ");
```

### Why This Matters

**Flexibility:** Agent can adapt the sequence based on what it discovers
- If there are no recent emails, it skips that section
- If it finds a recent transcript, it prioritizes summarizing that
- If deal is in closing stage, it focuses on final steps

**Transparency:** You see every tool call the agent makes

**Debuggability:** When something fails, you know exactly which tool failed

**Extensibility:** Adding new data sources doesn't require rewriting workflows

---

## 5. Tool Architecture: The Three-Tier Model

Based on industry best practices from Anthropic, Vercel, and the broader AI agent community, we structure our system in three distinct tiers:

### Tier 1: Atomic Tools (Fine-Grained)

**Definition:** Single-purpose functions that perform ONE operation
**Implementation:** Registered as tools in Vercel AI SDK
**Characteristics:**
- One API call or database operation
- Clear input/output contract
- No decision-making logic
- Composable and reusable

**Example Tools:**

```typescript
// ✅ GOOD - Atomic, single-purpose
tools: {
  // HubSpot Operations
  get_deal_properties: tool({
    description: "Fetch properties for a specific HubSpot deal by ID",
    parameters: z.object({
      deal_id: z.string().describe("The HubSpot deal ID")
    }),
    execute: async ({ deal_id }) => {
      return await hubspot.deals.getById(deal_id);
    }
  }),
  
  update_deal_stage: tool({
    description: "Update the stage of a HubSpot deal",
    parameters: z.object({
      deal_id: z.string(),
      stage: z.enum(['qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'])
    }),
    execute: async ({ deal_id, stage }) => {
      return await hubspot.deals.update(deal_id, { dealstage: stage });
    }
  }),
  
  // Gmail Operations
  search_emails: tool({
    description: "Search Gmail for emails involving specific contacts",
    parameters: z.object({
      contact_email: z.string().describe("Email address to search for"),
      query: z.string().optional().describe("Additional search query"),
      max_results: z.number().default(10)
    }),
    execute: async ({ contact_email, query, max_results }) => {
      const searchQuery = query 
        ? `from:${contact_email} OR to:${contact_email} ${query}`
        : `from:${contact_email} OR to:${contact_email}`;
      return await gmail.users.messages.list({
        userId: 'me',
        q: searchQuery,
        maxResults: max_results
      });
    }
  }),
  
  get_email_thread: tool({
    description: "Get full content of an email thread by ID",
    parameters: z.object({
      thread_id: z.string()
    }),
    execute: async ({ thread_id }) => {
      return await gmail.users.threads.get({
        userId: 'me',
        id: thread_id
      });
    }
  }),
  
  // Google Drive Operations
  list_folder_files: tool({
    description: "List files in a Google Drive folder, optionally filtered by type",
    parameters: z.object({
      folder_id: z.string(),
      file_type: z.enum(['pdf', 'doc', 'sheet', 'all']).optional(),
      max_results: z.number().default(20)
    }),
    execute: async ({ folder_id, file_type, max_results }) => {
      let query = `'${folder_id}' in parents and trashed=false`;
      if (file_type && file_type !== 'all') {
        const mimeTypes = {
          pdf: 'application/pdf',
          doc: 'application/vnd.google-apps.document',
          sheet: 'application/vnd.google-apps.spreadsheet'
        };
        query += ` and mimeType='${mimeTypes[file_type]}'`;
      }
      return await drive.files.list({
        q: query,
        pageSize: max_results,
        orderBy: 'modifiedTime desc'
      });
    }
  }),
  
  read_file_content: tool({
    description: "Read the content of a file from Google Drive",
    parameters: z.object({
      file_id: z.string(),
      mime_type: z.string().optional()
    }),
    execute: async ({ file_id, mime_type }) => {
      return await drive.files.export({
        fileId: file_id,
        mimeType: mime_type || 'text/plain'
      });
    }
  }),
  
  // Asana Operations
  get_project_tasks: tool({
    description: "Get all tasks for an Asana project",
    parameters: z.object({
      project_id: z.string()
    }),
    execute: async ({ project_id }) => {
      return await asana.tasks.findByProject(project_id);
    }
  }),
  
  update_task: tool({
    description: "Update a specific Asana task",
    parameters: z.object({
      task_id: z.string(),
      updates: z.object({
        name: z.string().optional(),
        notes: z.string().optional(),
        completed: z.boolean().optional(),
        due_on: z.string().optional()
      })
    }),
    execute: async ({ task_id, updates }) => {
      return await asana.tasks.update(task_id, updates);
    }
  }),
  
  // AI-Powered Operations (still atomic)
  summarize_text: tool({
    description: "Summarize a long text into key points",
    parameters: z.object({
      text: z.string(),
      max_length: z.number().optional().default(200),
      focus: z.string().optional().describe("What to focus on in the summary")
    }),
    execute: async ({ text, max_length, focus }) => {
      const prompt = focus 
        ? `Summarize the following text, focusing on ${focus}. Keep it under ${max_length} words:\n\n${text}`
        : `Summarize the following text in under ${max_length} words:\n\n${text}`;
      
      const { text: summary } = await generateText({
        model: 'gpt-5',
        prompt
      });
      return summary;
    }
  }),
  
  extract_action_items: tool({
    description: "Extract action items and next steps from text",
    parameters: z.object({
      text: z.string()
    }),
    execute: async ({ text }) => {
      const { object } = await generateObject({
        model: 'gpt-5',
        schema: z.object({
          action_items: z.array(z.object({
            task: z.string(),
            assignee: z.string().optional(),
            due_date: z.string().optional(),
            priority: z.enum(['high', 'medium', 'low']).optional()
          }))
        }),
        prompt: `Extract action items from this text:\n\n${text}`
      });
      return object.action_items;
    }
  })
}
```

### Tier 2: Agent Skills (Capabilities)

**Definition:** High-level capabilities the agent can accomplish by orchestrating tools
**Implementation:** Described in the agent's system prompt, NOT as separate tool functions
**Characteristics:**
- Multi-step operations
- Requires reasoning about which tools to use
- May adapt based on discovered information
- Achieved through tool orchestration

**Skills Definition (Goes in System Prompt):**

```typescript
const systemPrompt = `You are a Deal Management Agent with access to HubSpot, Gmail, Google Drive, and Asana.

CORE CAPABILITIES YOU POSSESS:

1. STATUS REPORTING
   - Fetch current deal info from HubSpot
   - Check recent emails from deal contacts
   - Look at recently modified files in Drive folder
   - Review Asana project tasks
   - Synthesize all information into a comprehensive status update

2. CALL SUMMARY
   - List files in the Deal's Google Drive folder
   - Identify the most recent transcript file (look for "transcript" in name and sort by date)
   - Read the transcript content
   - Summarize key discussion points, decisions made, and action items
   - If no transcript found, check recent emails for meeting notes

3. EMAIL TRIAGE
   - Search Gmail for messages from deal contacts
   - Identify which emails are unanswered or require follow-up
   - Prioritize based on recency and content
   - Provide a summary of pending communications

4. FOLLOW-UP EMAIL COMPOSITION
   - Review recent interactions (last call transcript or recent emails)
   - Check deal stage and context from HubSpot
   - Draft a contextually appropriate follow-up email
   - Include relevant details from recent conversations
   - Suggest next steps based on deal stage

5. ARTIFACT SEARCH
   - Search through Google Drive folder for specific documents
   - Read relevant files to find information
   - Provide summaries with source references

TOOL USAGE GUIDELINES:
- Always start by getting the Deal record from Supabase to know which systems to query
- Use tools sequentially - wait for results before deciding next step
- If you don't find what you're looking for, try alternative approaches
- Summarize information concisely for the user
- Always cite your sources (which tool provided which information)

CURRENT TASK:
The user will ask you to perform one of your capabilities. Use your available tools to accomplish their request.`;
```

**Key Point:** Notice that skills are NOT individual tool implementations. They are descriptions of what the agent can accomplish. The agent figures out HOW by orchestrating the atomic tools.

### Tier 3: Workflows (Only When Necessary)

**Definition:** Hardcoded sequences that MUST execute atomically or deterministically
**Implementation:** As specialized tools that internally run a fixed sequence
**When to Use:**
- ✅ Critical data synchronization that must be atomic (all or nothing)
- ✅ Compliance-required sequences that cannot vary
- ✅ Performance-critical operations where agent planning overhead is too high
- ❌ Any operation where the sequence might need to adapt
- ❌ Operations where debugging the sequence is important

**Example Workflow Tool:**

```typescript
// ⚠️ USE SPARINGLY - Only for critical atomic operations
atomic_deal_sync: tool({
  description: "Synchronize deal data from HubSpot to database (atomic operation)",
  parameters: z.object({
    deal_id: z.string()
  }),
  execute: async ({ deal_id }) => {
    // This MUST run as one transaction
    const client = await supabase.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Step 1: Get HubSpot data
      const hubspotDeal = await hubspot.deals.getById(deal_id);
      const contacts = await hubspot.crm.contacts.batchRead({
        ids: hubspotDeal.associations.contacts
      });
      
      // Step 2: Upsert to Supabase
      await client.from('deals').upsert({
        hubspot_deal_id: deal_id,
        name: hubspotDeal.properties.dealname,
        stage: hubspotDeal.properties.dealstage,
        amount: hubspotDeal.properties.amount,
        last_synced: new Date()
      });
      
      await client.from('contacts').upsert(
        contacts.results.map(c => ({
          email: c.properties.email,
          name: `${c.properties.firstname} ${c.properties.lastname}`,
          deal_id: deal_id
        }))
      );
      
      await client.query('COMMIT');
      return { success: true, synced_at: new Date() };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
})
```

**Rule of Thumb:** If you're tempted to create a workflow tool, ask:
1. "Could the agent accomplish this by calling tools in sequence?" → If yes, don't make it a workflow
2. "Does this HAVE to be atomic (all or nothing)?" → If no, don't make it a workflow
3. "Will I need to debug the sequence?" → If yes, don't make it a workflow

---

## 6. Technical Implementation with Vercel AI SDK

### 6.1 Agent Class Setup

```typescript
import { ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';

// Initialize model
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Define all atomic tools (see Tier 1 above)
const dealAgentTools = {
  // HubSpot tools
  get_deal_properties: tool({ /* ... */ }),
  update_deal_stage: tool({ /* ... */ }),
  get_contact_info: tool({ /* ... */ }),
  
  // Gmail tools
  search_emails: tool({ /* ... */ }),
  get_email_thread: tool({ /* ... */ }),
  
  // Drive tools
  list_folder_files: tool({ /* ... */ }),
  read_file_content: tool({ /* ... */ }),
  search_files_in_folder: tool({ /* ... */ }),
  
  // Asana tools
  get_project_tasks: tool({ /* ... */ }),
  update_task: tool({ /* ... */ }),
  create_task: tool({ /* ... */ }),
  
  // AI tools
  summarize_text: tool({ /* ... */ }),
  extract_action_items: tool({ /* ... */ }),
  analyze_sentiment: tool({ /* ... */ }),
  
  // Supabase tools
  get_deal_record: tool({
    description: "Get the Deal record from database which contains all connection IDs",
    parameters: z.object({
      deal_id: z.string()
    }),
    execute: async ({ deal_id }) => {
      const { data } = await supabase
        .from('deals')
        .select('*')
        .eq('id', deal_id)
        .single();
      return data;
    }
  })
};

// Create the agent
const dealAgent = new ToolLoopAgent({
  model: openai('gpt-5'),
  systemPrompt: SYSTEM_PROMPT, // The detailed capabilities from Tier 2
  tools: dealAgentTools,
  maxSteps: 15, // Prevent infinite loops
});
```

### 6.2 Controlling Agent Execution

```typescript
// Example 1: Let agent run until it decides it's done
const response = await dealAgent.run({
  messages: [
    {
      role: 'user',
      content: 'Generate a status report for deal abc-123'
    }
  ]
});

// Example 2: Stop after specific condition
const response = await dealAgent.run({
  messages: [
    {
      role: 'user',
      content: 'Find and summarize the latest call transcript'
    }
  ],
  stopWhen: (step) => {
    // Stop once we've successfully summarized something
    return step.toolResults?.some(result => 
      result.toolName === 'summarize_text' && result.result
    );
  }
});

// Example 3: Provide context between steps
const response = await dealAgent.run({
  messages: [
    {
      role: 'user',
      content: 'Check email status for this deal'
    }
  ],
  prepareStep: (step) => {
    // You can modify context or add instructions dynamically
    if (step.stepNumber > 5) {
      return {
        ...step,
        additionalSystemPrompt: "You've made 5 tool calls. Start wrapping up your analysis."
      };
    }
    return step;
  }
});
```

### 6.3 Real-World Usage Pattern

```typescript
// CLI implementation
async function handleUserCommand(command: string, dealId: string) {
  // Get deal context first
  const { data: deal } = await supabase
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .single();
  
  if (!deal) {
    throw new Error(`Deal ${dealId} not found`);
  }
  
  // Provide context to agent
  const messages = [
    {
      role: 'system',
      content: `DEAL CONTEXT:
        - Deal ID: ${deal.id}
        - HubSpot Deal ID: ${deal.hubspot_deal_id}
        - Google Drive Folder: ${deal.google_folder_id}
        - Asana Project: ${deal.asana_project_id || 'Not linked'}
        - Contact Emails: ${deal.contact_emails.join(', ')}
      `
    },
    {
      role: 'user',
      content: command
    }
  ];
  
  // Run agent
  const response = await dealAgent.run({
    messages,
    maxSteps: 20
  });
  
  return response;
}

// Usage
await handleUserCommand(
  "What's the status of this deal?",
  "deal-abc-123"
);
// Agent will:
// 1. Call get_deal_properties with HubSpot ID
// 2. Call search_emails with contact emails
// 3. Call list_folder_files with Drive folder ID
// 4. Call get_project_tasks with Asana project ID
// 5. Synthesize all information into a response
```

---

## 7. Deal Object Schema

### Supabase Tables

#### `deals` Table

```sql
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- External System IDs
  hubspot_deal_id VARCHAR(255) NOT NULL UNIQUE,
  google_folder_id VARCHAR(255),
  asana_project_id VARCHAR(255),
  
  -- Deal Metadata
  name VARCHAR(500) NOT NULL,
  stage VARCHAR(100),
  amount DECIMAL(12, 2),
  close_date DATE,
  
  -- Associated Contacts
  contact_emails JSONB DEFAULT '[]'::jsonb,
  
  -- Sync Metadata
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Additional Context
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Indexes
  CONSTRAINT valid_stage CHECK (stage IN (
    'qualification',
    'proposal', 
    'negotiation',
    'closed-won',
    'closed-lost'
  ))
);

CREATE INDEX idx_deals_hubspot_id ON deals(hubspot_deal_id);
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_close_date ON deals(close_date);
```

#### `deal_interactions` Table (For Context History)

```sql
CREATE TABLE deal_interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  
  -- Interaction Details
  interaction_type VARCHAR(50) NOT NULL, -- 'email', 'call', 'meeting', 'note'
  source_system VARCHAR(50) NOT NULL, -- 'gmail', 'hubspot', 'drive', 'asana'
  source_id VARCHAR(255), -- External ID from source system
  
  -- Content
  summary TEXT,
  full_content TEXT,
  
  -- Metadata
  interaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Structured Data
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_interactions_deal ON deal_interactions(deal_id);
CREATE INDEX idx_interactions_date ON deal_interactions(interaction_date DESC);
CREATE INDEX idx_interactions_type ON deal_interactions(interaction_type);
```

#### `agent_logs` Table (For Debugging and Analytics)

```sql
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  
  -- Request Details
  user_message TEXT NOT NULL,
  agent_response TEXT,
  
  -- Execution Metadata
  tool_calls JSONB, -- Array of {tool_name, arguments, result, duration}
  total_duration_ms INTEGER,
  tokens_used INTEGER,
  
  -- Status
  status VARCHAR(50) DEFAULT 'success', -- 'success', 'error', 'timeout'
  error_message TEXT,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_logs_deal ON agent_logs(deal_id);
CREATE INDEX idx_logs_started ON agent_logs(started_at DESC);
```

---

## 8. System Architecture

### High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI INTERFACE                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   CLI Client                              │   │
│  │          (Command-line interaction)                       │   │
│  └────────────────────┬─────────────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AGENT LAYER                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Deal Agent (Vercel AI SDK)                   │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │  System Prompt (Skills & Capabilities)              │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │  Tool Registry (Atomic Tools)                       │ │   │
│  │  │  - HubSpot Tools  - Gmail Tools                     │ │   │
│  │  │  - Drive Tools    - Asana Tools                     │ │   │
│  │  │  - AI Tools       - Database Tools                  │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │  Execution Controller (stopWhen, prepareStep)       │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ HubSpot  │  │  Gmail   │  │  Drive   │  │  Asana   │        │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼─────────────┼─────────────┼─────────────┼───────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL APIS                                 │
│   [HubSpot API]  [Gmail API]  [Drive API]  [Asana API]          │
└─────────────────────────────────────────────────────────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PERSISTENCE                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Supabase                               │   │
│  │  ┌────────────┐  ┌────────────────┐  ┌───────────────┐  │   │
│  │  │   Deals    │  │ Interactions   │  │  Agent Logs   │  │   │
│  │  │   Table    │  │     Table      │  │     Table     │  │   │
│  │  └────────────┘  └────────────────┘  └───────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Example

**User Request: "What's the status of deal XYZ?"**

```
1. User Input → API Route
   GET /api/deals/xyz/status
   
2. API Route → Agent
   dealAgent.run({
     messages: [{ role: 'user', content: 'What's the status?' }],
     context: { dealId: 'xyz' }
   })
   
3. Agent → Tool Selection (Claude decides)
   Step 1: Call get_deal_record('xyz')
   Step 2: Call get_deal_properties(hubspot_deal_id)
   Step 3: Call search_emails(contact_emails, 'after:7d')
   Step 4: Call list_folder_files(google_folder_id)
   Step 5: Call get_project_tasks(asana_project_id)
   
4. Tools → Adapters → External APIs
   Each tool calls appropriate adapter
   Adapters handle auth, rate limiting, retries
   
5. Results → Agent Synthesis
   Agent combines all tool results
   Generates natural language summary
   
6. Response → User
   Formatted status report with:
   - Current deal stage
   - Recent email activity
   - Latest documents
   - Task progress
```

---

## 9. CLI Implementation

### 9.1 Goals

- Prove the agent architecture works
- Test tool orchestration
- Validate data flows from all integrations
- Establish error handling patterns
- Provide command-line interface for agent interaction

### 9.2 CLI Commands

```bash
# Setup and configuration
deal-agent init                    # Initialize config, setup API keys
deal-agent connect <deal_id>      # Connect a deal to external systems

# Core agent interactions
deal-agent ask <deal_id> "question"           # Free-form query
deal-agent status <deal_id>                   # Quick status report
deal-agent calls <deal_id>                    # Summarize recent calls
deal-agent emails <deal_id>                   # Check email status
deal-agent draft <deal_id> "context"          # Draft follow-up email

# Data management
deal-agent sync <deal_id>          # Sync deal data from HubSpot
deal-agent list                    # List all deals
deal-agent info <deal_id>          # Show deal connections

# Debugging
deal-agent logs <deal_id>          # Show agent execution logs
deal-agent tools                   # List available tools
deal-agent test-tool <tool_name>   # Test a specific tool
```

### 9.3 Implementation Structure

```
deal-agent-cli/
├── src/
│   ├── index.ts              # CLI entry point, command routing
│   ├── agent/
│   │   ├── core.ts           # Agent initialization
│   │   ├── system-prompt.ts  # System prompt with capabilities
│   │   └── tools/            # Tool implementations
│   │       ├── hubspot.ts
│   │       ├── gmail.ts
│   │       ├── drive.ts
│   │       ├── asana.ts
│   │       ├── ai.ts
│   │       └── database.ts
│   ├── integrations/
│   │   ├── hubspot-adapter.ts
│   │   ├── gmail-adapter.ts
│   │   ├── drive-adapter.ts
│   │   └── asana-adapter.ts
│   ├── database/
│   │   ├── supabase-client.ts
│   │   └── schema.ts
│   └── utils/
│       ├── config.ts
│       ├── logger.ts
│       └── formatters.ts
├── package.json
├── tsconfig.json
└── .env.example
```

### 9.4 Example CLI Session

```bash
$ deal-agent init
✓ Configuration initialized
✓ API keys validated
✓ Database connected

$ deal-agent connect deal-abc-123 \
  --hubspot hs-deal-456 \
  --drive folder-xyz \
  --asana project-789

✓ Connected deal-abc-123 to external systems
  HubSpot: hs-deal-456
  Drive: folder-xyz
  Asana: project-789

$ deal-agent status deal-abc-123

🤖 Analyzing deal status...

[Tool: get_deal_record] ✓ Retrieved deal record
[Tool: get_deal_properties] ✓ Fetched HubSpot data
[Tool: search_emails] ✓ Found 3 recent emails
[Tool: list_folder_files] ✓ Found 12 files (2 new)
[Tool: get_project_tasks] ✓ Retrieved 8 tasks (3 in progress)

📊 Deal Status Report: Acme Corp - Enterprise Plan

Stage: Negotiation
Amount: $45,000
Close Date: Nov 15, 2025

Recent Activity:
• Last contact: Oct 28 (3 days ago) - Email from john@acme.com
• Latest document: "Pricing Proposal v3.pdf" uploaded Oct 29
• Open tasks: 3/8 in progress, 5/8 completed

Key Points:
✓ Proposal accepted, awaiting final contract review
✓ Technical integration questions answered in last call
⚠️ Follow-up needed: Contract terms discussion (overdue by 1 day)

Recommended Action:
Send follow-up email to check on contract review status.

$ deal-agent draft deal-abc-123 "follow up on contract review"

🤖 Drafting email...

[Tool: get_email_thread] ✓ Retrieved last conversation
[Tool: read_file_content] ✓ Read latest proposal
[Tool: get_deal_properties] ✓ Got current stage

📧 Draft Email:

Subject: Following up on Acme Corp contract review

Hi John,

I wanted to check in on the status of the contract review we discussed 
last week. I know your team was planning to review the terms by end of 
October.

As a quick recap, we've addressed:
- Technical integration requirements (covered in our Oct 22 call)
- Custom reporting needs (included in the updated proposal)
- Data migration timeline (4-week implementation plan)

The pricing proposal (v3) with the negotiated terms is ready for 
signature. Is there anything else you need from our side to move forward?

Looking forward to getting this across the finish line!

Best,
[Your name]

---

Copy this email? (y/n): _
```

---

## 10. Integration Specifications

### 10.1 HubSpot Integration

**Authentication:** Private App Token
**Base URL:** `https://api.hubapi.com`

**Required Scopes:**
- `crm.objects.deals.read`
- `crm.objects.deals.write`
- `crm.objects.contacts.read`
- `crm.schemas.deals.read`

**Key Endpoints:**
```typescript
// Get deal by ID
GET /crm/v3/objects/deals/{dealId}

// Update deal properties
PATCH /crm/v3/objects/deals/{dealId}
Body: {
  properties: {
    dealstage: "negotiation",
    amount: "45000"
  }
}

// Get associated contacts
GET /crm/v3/objects/deals/{dealId}/associations/contacts

// Search deals
POST /crm/v3/objects/deals/search
Body: {
  filterGroups: [
    {
      filters: [
        {
          propertyName: "dealstage",
          operator: "EQ",
          value: "negotiation"
        }
      ]
    }
  ]
}
```

**Rate Limits:**
- 100 requests per 10 seconds (burst)
- Consider implementing request queue

**Error Handling:**
```typescript
async function hubspotWithRetry(operation: () => Promise<any>) {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (error.status === 429) { // Rate limit
        const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retries++;
      } else {
        throw error;
      }
    }
  }
}
```

### 10.2 Gmail Integration

**Authentication:** OAuth 2.0
**Scopes:**
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.compose`

**Key Operations:**
```typescript
// Search messages
gmail.users.messages.list({
  userId: 'me',
  q: 'from:john@acme.com after:2025/10/20',
  maxResults: 10
});

// Get full message
gmail.users.messages.get({
  userId: 'me',
  id: messageId,
  format: 'full'
});

// Get thread
gmail.users.threads.get({
  userId: 'me',
  id: threadId
});

// Create draft
gmail.users.drafts.create({
  userId: 'me',
  requestBody: {
    message: {
      raw: base64EncodedEmail
    }
  }
});
```

**Parsing Emails:**
```typescript
function parseGmailMessage(message: any) {
  const headers = message.payload.headers;
  
  return {
    subject: headers.find(h => h.name === 'Subject')?.value,
    from: headers.find(h => h.name === 'From')?.value,
    to: headers.find(h => h.name === 'To')?.value,
    date: headers.find(h => h.name === 'Date')?.value,
    body: extractBody(message.payload),
    snippet: message.snippet
  };
}

function extractBody(payload: any): string {
  if (payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString();
  }
  
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain') {
        return Buffer.from(part.body.data, 'base64').toString();
      }
    }
  }
  
  return '';
}
```

### 10.3 Google Drive Integration

**Authentication:** OAuth 2.0 (same as Gmail)
**Scopes:**
- `https://www.googleapis.com/auth/drive.readonly`

**Key Operations:**
```typescript
// List files in folder
drive.files.list({
  q: `'${folderId}' in parents and trashed=false`,
  pageSize: 20,
  orderBy: 'modifiedTime desc',
  fields: 'files(id, name, mimeType, modifiedTime, webViewLink)'
});

// Get file metadata
drive.files.get({
  fileId: fileId,
  fields: 'id, name, mimeType, size, createdTime, modifiedTime'
});

// Download file content
drive.files.get({
  fileId: fileId,
  alt: 'media'
}, { responseType: 'arraybuffer' });

// Export Google Doc as text
drive.files.export({
  fileId: fileId,
  mimeType: 'text/plain'
});
```

**Handling Different File Types:**
```typescript
async function getFileContent(fileId: string, mimeType: string) {
  if (mimeType.includes('google-apps')) {
    // Export Google Workspace files
    const exportMimeType = mimeType.includes('document') 
      ? 'text/plain'
      : mimeType.includes('spreadsheet')
      ? 'text/csv'
      : 'application/pdf';
      
    const response = await drive.files.export({
      fileId,
      mimeType: exportMimeType
    });
    
    return response.data;
  } else if (mimeType === 'application/pdf') {
    // Handle PDFs specially (may need OCR)
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    }, { responseType: 'arraybuffer' });
    
    // TODO: Extract text from PDF
    return await extractTextFromPDF(response.data);
  } else {
    // Download as-is
    const response = await drive.files.get({
      fileId,
      alt: 'media'
    });
    
    return response.data;
  }
}
```

### 10.4 Asana Integration

**Authentication:** Personal Access Token
**Base URL:** `https://app.asana.com/api/1.0`

**Key Endpoints:**
```typescript
// Get project tasks
GET /projects/{project_id}/tasks

// Get task details
GET /tasks/{task_id}

// Update task
PUT /tasks/{task_id}
Body: {
  data: {
    completed: true,
    notes: "Updated via Deal Agent"
  }
}

// Create task
POST /tasks
Body: {
  data: {
    name: "Follow up with Acme Corp",
    notes: "Discuss contract terms",
    projects: [project_id],
    due_on: "2025-11-05"
  }
}
```

**Rate Limits:**
- 150 requests per minute
- Implement rate limiting in adapter

---

## 11. Technical Stack

### Production Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **AI Runtime** | Vercel AI SDK | 5.x | Agent orchestration, tool calling |
| **LLM** | OpenAI GPT-5 | Latest | Primary reasoning model |
| **Database** | Supabase | Latest | PostgreSQL for data persistence |
| **Package Manager** | PNPM | 9.x | Fast, space-efficient |
| **TypeScript** | TypeScript | 5.x | Type safety |
| **Runtime** | Node.js | 18+ | JavaScript runtime |

### Development Tools

| Tool | Purpose |
|------|---------|
| ESLint | Code linting |
| Prettier | Code formatting |
| Zod | Runtime type validation |
| Vitest | Testing framework |
| TSX | TypeScript execution |

### API Clients

```typescript
// Package.json dependencies
{
  "dependencies": {
    "ai": "~4.3.19",
    "@ai-sdk/openai": "~1.3.24",
    "zod": "^3.25.0",
    "@hubspot/api-client": "^11.0.0",
    "chalk": "^5.0.0",
    "commander": "^12.0.0",
    "dotenv": "^16.0.0",
    "openai": "^4.0.0",
    "ora": "^8.0.0",
    "zod-to-json-schema": "^3.24.6"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "vitest": "^1.0.0"
  }
}
```

---

## 12. Development Roadmap

### Phase 1: Foundation (Weeks 1-3)

**Week 1: Infrastructure Setup**
- [ ] Initialize Node.js/TypeScript project
- [ ] Configure Supabase (database)
- [ ] Set up development environment
- [ ] Create database schema (deals, interactions, logs)
- [ ] Implement basic CLI scaffolding

**Week 2: Integration Layer**
- [ ] Build HubSpot adapter with authentication
- [ ] Build Gmail adapter with OAuth flow
- [ ] Build Google Drive adapter
- [ ] Build Asana adapter
- [ ] Create integration test suite

**Week 3: Agent Core**
- [ ] Implement all Tier 1 atomic tools
- [ ] Write comprehensive system prompt (Tier 2 skills)
- [ ] Set up Vercel AI SDK agent
- [ ] Test tool orchestration
- [ ] Implement error handling and retries

### Phase 2: CLI & Testing (Weeks 4-5)

**Week 4: CLI Commands**
- [ ] Implement `init` and `connect` commands
- [ ] Implement `status`, `calls`, `emails` commands
- [ ] Implement `draft` command
- [ ] Add logging and debugging commands
- [ ] Create user documentation

**Week 5: Testing & Refinement**
- [ ] End-to-end testing with real accounts
- [ ] Performance optimization (caching, rate limits)
- [ ] Error handling improvements
- [ ] CLI UX polish
- [ ] Write troubleshooting guide

### Phase 3: Future Enhancements (Ongoing)

**Advanced Features**
- [ ] Zoom/Meet transcript ingestion
- [ ] Automated task creation in Asana
- [ ] Slack integration for notifications
- [ ] Vector embeddings for long-term memory
- [ ] Multi-user/team support
- [ ] Custom agent training on company data

---

## 13. Success Criteria

### MVP Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Integration Coverage** | 4/4 systems working | HubSpot, Gmail, Drive, Asana all connected |
| **Tool Reliability** | >95% success rate | Measured via agent logs |
| **Agent Accuracy** | >90% correct tool selection | Manual evaluation of 100 queries |
| **Response Time** | <10 seconds | For single-skill operations |
| **Code Modularity** | <50 lines | To add a new tool |

### Technical Excellence Metrics

| Metric | Target | Tool |
|--------|--------|------|
| **Type Coverage** | >90% | TypeScript strict mode |
| **Test Coverage** | >70% | Vitest |
| **Error Rate** | <1% | Error logging |
| **CLI Response Time** | <2s | Performance monitoring |

---

## 14. Appendix A: Code Examples

### Example 1: Complete Tool Implementation

```typescript
// src/agent/tools/hubspot.ts
import { tool } from 'ai';
import { z } from 'zod';
import { hubspotClient } from '@/lib/integrations/hubspot-adapter';

export const get_deal_properties = tool({
  description: `Fetch comprehensive properties for a HubSpot deal.
  
  Returns deal information including:
  - Deal name and stage
  - Amount and close date  
  - Associated contacts
  - Custom properties
  - Last activity date
  
  Use this when you need current deal information from the CRM.`,
  
  parameters: z.object({
    deal_id: z.string().describe("The HubSpot deal ID")
  }),
  
  execute: async ({ deal_id }) => {
    try {
      const deal = await hubspotClient.crm.deals.basicApi.getById(
        deal_id,
        ['dealname', 'dealstage', 'amount', 'closedate', 'hs_lastmodifieddate'],
        undefined,
        ['contacts']
      );
      
      return {
        success: true,
        deal: {
          id: deal.id,
          name: deal.properties.dealname,
          stage: deal.properties.dealstage,
          amount: parseFloat(deal.properties.amount || '0'),
          closeDate: deal.properties.closedate,
          lastModified: deal.properties.hs_lastmodifieddate,
          contactIds: deal.associations?.contacts?.results.map(c => c.id) || []
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch deal: ${error.message}`
      };
    }
  }
});
```

### Example 2: Complete System Prompt

```typescript
// src/agent/system-prompt.ts
export const SYSTEM_PROMPT = `You are a Deal Management Agent with expertise in sales operations and deal orchestration.

IDENTITY & ROLE:
You help sales professionals manage their deals by connecting data across HubSpot, Gmail, Google Drive, and Asana. You are proactive, detail-oriented, and always cite your sources.

CORE CAPABILITIES:

1. STATUS REPORTING
   Goal: Provide a comprehensive overview of a deal's current state
   Method:
   - Get the deal record from database to know system IDs
   - Fetch current deal properties from HubSpot (stage, amount, close date)
   - Search recent emails (last 7-14 days) to understand recent communications
   - Check Google Drive for recently modified documents
   - Review Asana tasks to see operational progress
   - Synthesize all information into a clear, actionable summary
   
   Format your report with:
   - Deal basics (stage, amount, close date)
   - Recent activity summary
   - Key concerns or blockers
   - Recommended next actions

2. CALL SUMMARY
   Goal: Summarize the most recent call or meeting
   Method:
   - List files in the deal's Google Drive folder
   - Look for the most recent file with "transcript" in the name
   - If found, read the file content
   - Summarize key points: main topics, decisions, action items, concerns raised
   - If no transcript found, check recent emails for meeting notes
   
   Format your summary with:
   - Meeting date and participants (if identifiable)
   - Key discussion points
   - Decisions made
   - Action items with owners (if identifiable)
   - Follow-up needed

3. EMAIL TRIAGE
   Goal: Identify which emails need attention
   Method:
   - Search Gmail for emails from deal contacts (last 14 days)
   - Analyze each email for:
     * Whether it's been replied to
     * Urgency indicators (questions, deadlines, escalations)
     * Sentiment (positive, neutral, concerning)
   - Prioritize unanswered emails and urgent matters
   
   Format your triage with:
   - Urgent items that need immediate attention
   - Pending replies
   - FYI items (no action needed)

4. FOLLOW-UP EMAIL COMPOSITION
   Goal: Draft a contextually appropriate follow-up email
   Method:
   - Check recent interactions (transcripts or emails)
   - Review deal stage and context from HubSpot
   - Draft an email that:
     * References recent conversations naturally
     * Addresses any open questions or action items
     * Moves the deal forward based on current stage
     * Maintains professional but personable tone
   - Format as a ready-to-send draft
   
   Include in draft:
   - Clear subject line
   - Natural reference to previous conversation
   - Specific next steps or questions
   - Appropriate closing

5. ARTIFACT SEARCH
   Goal: Find specific information in deal documents
   Method:
   - Search through Google Drive folder
   - Look for files matching the query
   - Read relevant files
   - Extract and summarize relevant information
   - Always cite which document you found information in

TOOL USAGE BEST PRACTICES:

1. Always start by getting the deal record from the database
   - This gives you all the system IDs you need
   - Don't assume you know the IDs

2. Call tools sequentially, not all at once
   - Wait for one result before deciding if you need more
   - Adapt your approach based on what you find

3. Handle missing data gracefully
   - If a system isn't connected (e.g., no Asana project), skip it
   - If you don't find what you're looking for, say so clearly

4. Always cite your sources
   - "According to HubSpot, the deal is in negotiation stage"
   - "The most recent email from john@acme.com (Oct 28)..."
   - "Based on the transcript from Oct 25..."

5. Be concise but comprehensive
   - Users are busy - get to the point
   - But don't skip important details
   - Use formatting (bullet points, sections) for readability

6. Suggest proactive actions
   - Don't just report status - recommend next steps
   - Flag potential issues or risks
   - Identify opportunities to move the deal forward

ERROR HANDLING:
- If a tool fails, try an alternative approach
- Always explain what went wrong if you can't complete a request
- Suggest manual workarounds when appropriate

TONE:
- Professional but conversational
- Confident but not arrogant
- Helpful and proactive
- Clear and concise

Remember: Your goal is to save the user time and help them stay on top of their deals. Be the assistant they wish they had.`;
```

### Example 3: Agent Initialization

```typescript
// src/agent/core.ts
import { ToolLoopAgent } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system-prompt';
import * as hubspotTools from './tools/hubspot';
import * as gmailTools from './tools/gmail';
import * as driveTools from './tools/drive';
import * as asanaTools from './tools/asana';
import * as aiTools from './tools/ai';
import * as databaseTools from './tools/database';

// Initialize OpenAI
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Combine all tools
export const dealAgentTools = {
  ...hubspotTools,
  ...gmailTools,
  ...driveTools,
  ...asanaTools,
  ...aiTools,
  ...databaseTools,
};

// Create the agent
export const dealAgent = new ToolLoopAgent({
  model: openai('gpt-5'),
  systemPrompt: SYSTEM_PROMPT,
  tools: dealAgentTools,
  maxSteps: 20,
  
  // Optional: Add execution monitoring
  onStepFinish: (step) => {
    console.log(`Step ${step.stepNumber} completed:`, {
      toolCalls: step.toolCalls?.length || 0,
      response: step.response ? 'Generated' : 'No response'
    });
  }
});

// Helper function for CLI/API usage
export async function runDealAgent(
  dealId: string,
  userMessage: string,
  conversationHistory: any[] = []
) {
  // Get deal context
  const dealRecord = await databaseTools.get_deal_record.execute({ deal_id: dealId });
  
  if (!dealRecord.success) {
    throw new Error(`Deal ${dealId} not found`);
  }
  
  // Build messages with context
  const messages = [
    {
      role: 'system' as const,
      content: `DEAL CONTEXT:
        - Deal ID: ${dealRecord.deal.id}
        - Name: ${dealRecord.deal.name}
        - HubSpot ID: ${dealRecord.deal.hubspot_deal_id}
        - Drive Folder: ${dealRecord.deal.google_folder_id}
        - Asana Project: ${dealRecord.deal.asana_project_id || 'Not connected'}
        - Contacts: ${dealRecord.deal.contact_emails.join(', ')}
      `
    },
    ...conversationHistory,
    {
      role: 'user' as const,
      content: userMessage
    }
  ];
  
  // Run agent
  const response = await dealAgent.run({ messages });
  
  return {
    message: response.messages[response.messages.length - 1],
    toolCalls: response.messages.flatMap(m => m.toolCalls || []),
    usage: response.usage
  };
}
```

---

## 15. Appendix B: Tool Patterns

### Pattern 1: Search + Retrieve

Many workflows follow "search then get details":

```typescript
// 1. Search for items
const { results } = await search_emails.execute({
  contact_email: 'john@acme.com',
  query: 'after:2025/10/20'
});

// 2. Get full details for most relevant
const fullEmail = await get_email_thread.execute({
  thread_id: results[0].threadId
});

// 3. Analyze content
const analysis = await analyze_sentiment.execute({
  text: fullEmail.messages.map(m => m.body).join('\n\n')
});
```

Agent should learn this pattern naturally through system prompt guidance.

### Pattern 2: Conditional Execution

Agent adapts based on what it finds:

```typescript
// System prompt tells agent:
// "First check if there's an Asana project connected.
//  If yes, get tasks. If no, skip to next data source."

// Agent learns to:
if (dealRecord.asana_project_id) {
  const tasks = await get_project_tasks.execute({
    project_id: dealRecord.asana_project_id
  });
} else {
  // Skip Asana, continue with other sources
}
```

### Pattern 3: Iterative Refinement

Agent may need multiple attempts:

```typescript
// 1. Try finding transcript by name
let files = await list_folder_files.execute({
  folder_id: folderId,
  file_type: 'pdf'
});

let transcript = files.find(f => f.name.includes('transcript'));

// 2. If not found, try broader search
if (!transcript) {
  files = await list_folder_files.execute({
    folder_id: folderId,
    file_type: 'all'
  });
  
  transcript = files.find(f => 
    f.name.includes('call') || 
    f.name.includes('meeting') ||
    f.name.includes('notes')
  );
}

// 3. If still not found, check emails instead
if (!transcript) {
  const emails = await search_emails.execute({
    contact_email: contact,
    query: 'meeting notes OR call summary'
  });
}
```

### Pattern 4: Parallel Data Gathering

Agent can request multiple tools simultaneously (SDK handles execution):

```typescript
// Agent decides these can run in parallel:
const [
  hubspotData,
  recentEmails,
  recentFiles,
  asanaTasks
] = await Promise.all([
  get_deal_properties.execute({ deal_id }),
  search_emails.execute({ contact_email, query: 'after:7d' }),
  list_folder_files.execute({ folder_id, max_results: 10 }),
  get_project_tasks.execute({ project_id })
]);
```

System prompt should encourage parallel execution when possible for speed.

---

## Conclusion

This PRD provides a complete, implementation-ready specification for the Deal Agent Framework. Key takeaways:

1. **Agent-orchestrated, not workflow-driven**: Let Claude decide how to accomplish goals using fine-grained tools

2. **Three-tier architecture**: 
   - Tier 1: Atomic tools (one API call each)
   - Tier 2: Skills (capabilities described in system prompt)
   - Tier 3: Workflows (only for critical atomic operations)

3. **Vercel AI SDK provides the orchestration**: Use `ToolLoopAgent`, `stopWhen`, and `prepareStep` to control execution

4. **Start simple, add complexity only when needed**: Begin with basic tools and let the agent surprise you with its capabilities

The agent should feel intelligent and adaptive, not like a rigid automation. Users should be able to ask natural questions and get helpful answers, with the agent transparently showing its reasoning through tool calls.

Next steps:
1. Review this PRD with stakeholders
2. Set up development environment
3. Begin Phase 1: Week 1 (Infrastructure Setup)
4. Iterate based on real-world testing

---

**Document Version:** 2.0  
**Last Updated:** October 31, 2025  
**Status:** Ready for Implementation