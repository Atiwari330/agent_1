# Integration Plan: Deal Agent → AI ChatBot (REVISED)

- **Author**: Claude (Revised from Cascade's original plan)
- **Date**: 2025-11-01
- **Architecture Decision**: **Option C - Import Tools Directly**
- **Scope**: Integrate HubSpot tools from deal-agent into AI ChatBot. ChatBot's `streamText()` orchestrates; DealAgent class remains for CLI testing only.
- **Key Decision**: Switch ChatBot from xAI Grok to OpenAI GPT-5 (latest models).
- **Goal**: Preserve full agentic capabilities (multi-step reasoning, autonomous tool selection) while leveraging ChatBot's streaming UX, DB persistence, and web UI.

---

## GPT-5 Model Configuration

**OpenAI GPT-5 Models** (Released August 7, 2025):

| Model | API Name | Use Case | Pricing (Input/Output) | Performance |
|-------|----------|----------|------------------------|-------------|
| **GPT-5** | `gpt-5` | Maximum capability, complex reasoning | $1.25/1M → $10/1M | 100% |
| **GPT-5 Mini** | `gpt-5-mini` | Balanced performance & cost | $0.25/1M → $2/1M | 80% at 20% cost |
| **GPT-5 Nano** | `gpt-5-nano` | Simple tasks, high volume | $0.05/1M → $0.40/1M | Basic capabilities |

**All models support:**
- 272,000 input tokens / 128,000 output tokens
- Parallel tool calling (critical for HubSpot integration)
- Multimodal capabilities (text, images, etc.)
- 90% cache discount ($0.125/1M cached tokens)

**Recommended Configuration for ChatBot:**
- **Main chat model**: `gpt-5-mini` - Best balance for HubSpot tool calling (80% performance, 20% cost)
- **Title generation**: `gpt-5-nano` - Simple task, cost-effective
- **Artifact generation**: `gpt-5-mini` - Quality code/document generation
- **Alternative**: Use `gpt-5` for all tasks if maximum performance is required regardless of cost

---

## Architecture Decision: Option C

**What we're doing:**
- Import HubSpot tools directly into ChatBot's `/api/chat` route
- ChatBot's `streamText()` with GPT-5 orchestrates tool calls (just like DealAgent does with `generateText()`)
- DealAgent class stays unchanged for CLI testing (`pnpm run test-agent`)

**Why Option C:**
- ✅ Preserves ALL agentic capabilities (multi-step reasoning, autonomous tool selection, natural language understanding)
- ✅ Maintains streaming UX (progressive text display, better user experience)
- ✅ Leverages ChatBot's infrastructure (DB, auth, usage tracking, UI message streams)
- ✅ Simpler architecture - no duplicate orchestration layers
- ✅ The valuable part is the TOOLS, not the wrapper class

**Agentic Capabilities Confirmed:**
- ✅ Multi-step tool chaining (up to 5 sequential tool calls)
- ✅ Autonomous tool selection based on user intent
- ✅ Natural language understanding ("Find deals with Acme Corp" → automatically uses search_deals)
- ✅ LLM decides when to stop (no human intervention needed)
- ✅ Error recovery (if one tool fails, try alternative approach)
- ✅ Conversation context awareness

---

## Current State Summary

### Deal Agent (Root Directory)
- **AI SDK Version**: v4.3.19 (will upgrade to v5.0.26)
- **Structure**:
  - Tools: 6 HubSpot tools using `tool(...)` with `parameters` (v4 API, will migrate to `inputSchema`)
  - Orchestration: `DealAgent` class uses `generateText()` + `toolRegistry`
  - Location: `src/tools/hubspot/*`
- **Provider**: Currently OpenAI GPT-4o, will use GPT-5 models after integration
- **Config**: Requires `OPENAI_API_KEY`, `HUBSPOT_ACCESS_TOKEN`
- **Special Features**: Custom rate limiter for HubSpot Search API, comprehensive error handling

### AI ChatBot (ai_chatbot Directory)
- **AI SDK Version**: v5.0.26 (latest)
- **Structure**:
  - Tools: 4 tools (weather, documents) using `tool(...)` with `inputSchema` (v5 API)
  - Orchestration: `streamText()` with `createUIMessageStream()` in `/api/chat/route.ts`
- **Provider**: Currently xAI Grok via Vercel AI Gateway (will switch to OpenAI GPT-5 models)
- **Features**: Streaming responses, database persistence (Postgres), NextAuth, usage tracking, artifact creation

### Version Mismatch to Resolve
- Agent: `ai@~4.3.19`, `@ai-sdk/openai@~1.3.24`
- ChatBot: `ai@5.0.26`, `@ai-sdk/*@2.x`
- **Plan**: Upgrade agent to v5, test thoroughly, revert if issues arise

---

## Scope & Constraints

### In Scope
- ✅ Upgrade deal-agent tools to AI SDK v5
- ✅ Switch ChatBot to OpenAI GPT-5 models (gpt-5-mini for main chat, gpt-5-nano for titles)
- ✅ Import HubSpot tools into ChatBot
- ✅ Update system prompt for HubSpot capabilities
- ✅ Single-user setup (no multi-user auth/rate limiting)
- ✅ Plain text responses (no rich UI components for deals yet)
- ✅ Architecture designed to accommodate Gmail/Drive/Asana tools later

### Out of Scope (Future Enhancements)
- ❌ Rich UI components for deal data (cards, charts, etc.)
- ❌ Multi-user authentication and per-user HubSpot tokens
- ❌ Gmail/Drive/Asana tool implementation (architecture will support later)
- ❌ Advanced rate limiting per user
- ❌ Using DealAgent class in ChatBot (kept for CLI only)

---

## Step-by-Step Implementation Plan

### Phase 0: Git Repository Setup & Branch Management

**Goal**: Initialize git repository, push to remote, and create feature branch for integration work

**GitHub Repository**: `https://github.com/Atiwari330/agent_1.git`

**Steps**:

1. **Initialize local git repository** (if not already initialized):
   ```bash
   cd C:\Users\Adi\Desktop\agent_1
   git init
   ```

2. **Add remote repository**:
   ```bash
   git remote add origin https://github.com/Atiwari330/agent_1.git
   ```

3. **Verify remote is set correctly**:
   ```bash
   git remote -v
   # Should show:
   # origin  https://github.com/Atiwari330/agent_1.git (fetch)
   # origin  https://github.com/Atiwari330/agent_1.git (push)
   ```

4. **Stage all current files**:
   ```bash
   git add .
   ```

5. **Create initial commit with baseline code**:
   ```bash
   git commit -m "Initial commit: Deal Agent v4 + AI ChatBot baseline

   - Deal Agent with 6 HubSpot tools (AI SDK v4.3.19)
   - AI ChatBot with xAI Grok (AI SDK v5.0.26)
   - Integration plan documented
   - Ready for GPT-5 integration work"
   ```

6. **Push to main branch**:
   ```bash
   git branch -M main
   git push -u origin main
   ```

7. **Create feature branch for integration work**:
   ```bash
   git checkout -b feature/gpt5-hubspot-integration
   ```

8. **Verify you're on the feature branch**:
   ```bash
   git branch
   # Should show: * feature/gpt5-hubspot-integration
   ```

9. **Replace ARCHITECTURE_LOG.md with new integration log**:
   - **Delete old log**: `rm ARCHITECTURE_LOG.md`
   - **Create new log**: Create `INTEGRATION_LOG.md` to track this integration work
   - **Content structure**:
     ```markdown
     # Integration Log: GPT-5 & HubSpot ChatBot Integration

     **Start Date**: 2025-11-01
     **Project**: Integrate Deal Agent HubSpot tools into AI ChatBot with GPT-5
     **Branch**: feature/gpt5-hubspot-integration

     ## Baseline State (Phase 0)

     - Deal Agent: AI SDK v4.3.19, 6 HubSpot tools, OpenAI GPT-4o
     - AI ChatBot: AI SDK v5.0.26, xAI Grok, 4 existing tools
     - Repository: https://github.com/Atiwari330/agent_1.git
     - Main branch established with baseline code

     ## Integration Approach

     **Option C - Import Tools Directly**: ChatBot's streamText() orchestrates HubSpot tools.
     DealAgent class remains for CLI testing only.

     ## Phase Log

     ### Phase 0: Git Setup ✅
     - [Date] Initialized git repository
     - [Date] Pushed to main branch
     - [Date] Created feature branch: feature/gpt5-hubspot-integration
     - [Date] Started INTEGRATION_LOG.md

     ### Phase 1: AI SDK v5 Upgrade
     [To be documented during implementation]

     ### Phase 2: GPT-5 Model Switch
     [To be documented during implementation]

     [Continue for each phase...]
     ```

10. **Commit the new log file**:
    ```bash
    git add INTEGRATION_LOG.md
    git rm ARCHITECTURE_LOG.md
    git commit -m "Phase 0: Initialize git repo and create integration log

    - Set up remote: https://github.com/Atiwari330/agent_1.git
    - Pushed baseline to main branch
    - Created feature branch: feature/gpt5-hubspot-integration
    - Started INTEGRATION_LOG.md for tracking integration work
    - Removed old ARCHITECTURE_LOG.md"
    ```

11. **Push feature branch to remote**:
    ```bash
    git push -u origin feature/gpt5-hubspot-integration
    ```

**Success Criteria**:
- ✅ Local repository initialized
- ✅ Remote origin set to GitHub
- ✅ Main branch exists with baseline code
- ✅ Feature branch `feature/gpt5-hubspot-integration` created and checked out
- ✅ INTEGRATION_LOG.md created to track integration work
- ✅ Old ARCHITECTURE_LOG.md removed
- ✅ Ready to begin Phase 1 (AI SDK v5 upgrade)

**Important Notes for Future AI Agents**:
- **Always work on feature branches** for new features/integrations
- **Document progress in INTEGRATION_LOG.md** as you complete each phase
- **Commit frequently** with descriptive messages
- **Do not push directly to main** - use pull requests for merging
- **This feature branch** tracks the GPT-5 + HubSpot integration work specifically

---

### Phase 1: Upgrade Agent to AI SDK v5 & Test Thoroughly

**Goal**: Migrate agent from v4 to v5, verify all tools still work

**Steps**:
1. Update `package.json` in deal-agent root:
   ```json
   {
     "ai": "^5.0.26",
     "@ai-sdk/openai": "^2.0.0" // Optional, only if needed
   }
   ```

2. Migrate all 6 HubSpot tools from v4 to v5 API:
   - Files: `src/tools/hubspot/deals.ts` (4 tools), `src/tools/hubspot/properties.ts` (2 tools)
   - Change: `parameters: z.object(...)` → `inputSchema: z.object(...)`
   - Keep: `execute` signatures unchanged
   - Keep: `description` fields unchanged

3. **CRITICAL: Comprehensive Testing**
   - Run `pnpm install` to update dependencies
   - Execute `pnpm run test-agent` (runs against real HubSpot API)
   - Verify all 4 test queries pass:
     - "What deals do we have?" → list_deals
     - "Show me all available deal stages" → list_deal_stages
     - "Search for deals in appointmentscheduled stage" → search_deals
     - "What deal properties are available?" → get_deal_properties
   - Manually test rate limiter (concurrent search requests)
   - Verify error handling with invalid inputs
   - Test `generateText` still works in DealAgent class

4. **If tests fail**:
   - Investigate specific v5 compatibility issues
   - Check if documented v5 bugs still exist
   - **Revert to v4** if issues are blocking (use fallback: manually rewrite tools in v5 for ChatBot)

5. Document any breaking changes or workarounds needed

---

### Phase 2: Switch ChatBot to OpenAI GPT-5

**Goal**: Replace xAI Grok with OpenAI GPT-5 models as the ChatBot's LLM

**Model Selection:**
- **Main chat** (`chat-model`): `gpt-5-mini` - Best balance for tool calling (80% performance, 20% cost)
- **Reasoning** (`chat-model-reasoning`): `gpt-5` - Maximum capability for complex reasoning
- **Title generation** (`title-model`): `gpt-5-nano` - Simple task, cost-effective
- **Artifacts** (`artifact-model`): `gpt-5-mini` - Quality code/document generation

**Steps**:
1. Update `ai_chatbot/lib/ai/providers.ts`:

   **Option A: Using Vercel AI Gateway** (recommended for consistent API):
   ```typescript
   import { gateway } from '@ai-sdk/gateway';
   import { customProvider } from 'ai';

   export const myProvider = customProvider({
     languageModels: {
       "chat-model": gateway.languageModel("openai/gpt-5-mini"),
       "chat-model-reasoning": gateway.languageModel("openai/gpt-5"),
       "title-model": gateway.languageModel("openai/gpt-5-nano"),
       "artifact-model": gateway.languageModel("openai/gpt-5-mini")
     }
   });
   ```

   **Option B: Using @ai-sdk/openai directly**:
   ```typescript
   import { openai } from '@ai-sdk/openai';
   import { customProvider } from 'ai';

   export const myProvider = customProvider({
     languageModels: {
       "chat-model": openai("gpt-5-mini"),
       "chat-model-reasoning": openai("gpt-5"),
       "title-model": openai("gpt-5-nano"),
       "artifact-model": openai("gpt-5-mini")
     }
   });
   ```

   **Alternative (Max Performance)**: Use `gpt-5` for all models if cost is not a concern:
   ```typescript
   export const myProvider = customProvider({
     languageModels: {
       "chat-model": gateway.languageModel("openai/gpt-5"),
       "chat-model-reasoning": gateway.languageModel("openai/gpt-5"),
       "title-model": gateway.languageModel("openai/gpt-5"),
       "artifact-model": gateway.languageModel("openai/gpt-5")
     }
   });
   ```

2. Update `ai_chatbot/lib/ai/models.ts` (update model descriptions):
   ```typescript
   export const chatModels = [
     {
       id: "chat-model",
       name: "GPT-5 Mini",
       description: "Fast, balanced performance for general chat and tool calling"
     },
     {
       id: "chat-model-reasoning",
       name: "GPT-5",
       description: "Maximum capability for complex reasoning tasks"
     }
   ];
   ```

3. Ensure `OPENAI_API_KEY` is set in `ai_chatbot/.env`

4. **Test ChatBot baseline**:
   - Run `cd ai_chatbot && pnpm dev`
   - Create a new chat
   - Send basic queries: "Hello", "What's the weather in SF?"
   - Verify streaming works, messages persist, usage tracking works
   - Test tool calling with weather tool to confirm GPT-5 tool support works

---

### Phase 3: Set Up pnpm Workspace

**Goal**: Link deal-agent and ai_chatbot as a monorepo for clean imports

**Steps**:
1. Create `pnpm-workspace.yaml` at repo root (`C:\Users\Adi\Desktop\agent_1\`):
   ```yaml
   packages:
     - "."
     - "ai_chatbot"
   ```

2. Update `package.json` in deal-agent root:
   - Ensure it has a `name` field: `"name": "deal-agent"`
   - Ensure tools are exported: Already done in `src/tools/hubspot/index.ts`

3. Update `ai_chatbot/package.json`:
   ```json
   {
     "dependencies": {
       "deal-agent": "workspace:*",
       // ... other deps
     }
   }
   ```

4. Run `pnpm install` at repo root to link workspace

5. Verify import works:
   ```typescript
   // In any ai_chatbot file, try:
   import { hubspotTools } from 'deal-agent';
   console.log(hubspotTools);
   ```

**Fallback**: If workspace imports fail due to Next.js restrictions, copy compiled tools to `ai_chatbot/lib/agent-tools/` manually

---

### Phase 4: Integrate HubSpot Tools into ChatBot Route

**Goal**: Wire HubSpot tools into the streaming chat endpoint

**Steps**:
1. Update `ai_chatbot/app/(chat)/api/chat/route.ts`:

   **a) Export Node.js runtime** (HubSpot SDK requires Node):
   ```typescript
   export const runtime = 'nodejs';
   ```

   **b) Import HubSpot tools**:
   ```typescript
   import {
     get_deal_by_id,
     search_deals,
     list_deals,
     update_deal_stage,
     get_deal_properties,
     list_deal_stages
   } from 'deal-agent';
   // Or: import { hubspotTools } from 'deal-agent';
   ```

   **c) Register tools in `streamText()` call**:
   ```typescript
   const result = streamText({
     model: myProvider.languageModel(selectedChatModel),
     system: systemPrompt({ selectedChatModel, requestHints }),
     messages: convertToModelMessages(uiMessages),
     stopWhen: stepCountIs(5),
     experimental_activeTools: [
       "getWeather",
       "createDocument",
       "updateDocument",
       "requestSuggestions",
       // Add HubSpot tools:
       "get_deal_by_id",
       "search_deals",
       "list_deals",
       "update_deal_stage",
       "get_deal_properties",
       "list_deal_stages"
     ],
     tools: {
       getWeather,
       createDocument: createDocument({ session, dataStream }),
       updateDocument: updateDocument({ session, dataStream }),
       requestSuggestions: requestSuggestions({ session, dataStream }),
       // Add HubSpot tools:
       get_deal_by_id,
       search_deals,
       list_deals,
       update_deal_stage,
       get_deal_properties,
       list_deal_stages
     },
     experimental_transform: smoothStream({ chunking: "word" }),
     onFinish: async ({ usage }) => {
       // Existing usage tracking
     }
   });
   ```

2. **Keep existing ChatBot features unchanged**:
   - UI message stream creation
   - Database persistence
   - Usage tracking with TokenLens
   - SSE streaming via `JsonToSseTransformStream`

---

### Phase 5: Update System Prompt for HubSpot Capabilities

**Goal**: Teach the AI when and how to use HubSpot tools

**Steps**:
1. Update `ai_chatbot/lib/ai/prompts.ts`

2. Add new `hubspotPrompt` section:
   ```typescript
   const hubspotPrompt = `
   # HubSpot CRM Capabilities

   You have access to a HubSpot CRM integration with the following tools:

   **Deal Management Tools:**
   - \`get_deal_by_id\`: Retrieve a specific deal by its HubSpot ID
   - \`list_deals\`: List all deals (supports pagination, use for "show me all deals")
   - \`search_deals\`: Search deals with filters (use for specific criteria like stage, amount, owner)
   - \`update_deal_stage\`: Update a deal's pipeline stage

   **Metadata Tools:**
   - \`list_deal_stages\`: Get all available deal stages and pipelines
   - \`get_deal_properties\`: Get all deal property definitions (useful for understanding available fields)

   **When to use HubSpot tools:**
   - User asks about "deals", "CRM", "sales pipeline", "HubSpot"
   - User wants to search, filter, or update deal information
   - User asks about deal stages, properties, or metadata

   **Tool selection strategy:**
   - For "show me all deals" → use \`list_deals\`
   - For "find deals in [stage]" or "deals where [condition]" → use \`search_deals\` with filters
   - For "what stages do we have?" → use \`list_deal_stages\`
   - For multi-step queries, chain tools (e.g., search_deals → get_deal_by_id for details)

   **Response format:**
   - Keep responses concise and actionable
   - Format deal data as plain text (no markdown tables unless requested)
   - Cite deal IDs and names when referencing specific deals
   - If HubSpot API returns errors, explain clearly to the user

   **Future capabilities** (not yet available):
   - Gmail integration for deal-related emails
   - Google Drive integration for deal documents
   - Asana integration for deal-related tasks
   `;
   ```

3. Update `systemPrompt()` function to include HubSpot context:
   ```typescript
   export const systemPrompt = ({ selectedChatModel, requestHints }) => {
     const requestPrompt = getRequestPromptFromHints(requestHints);

     if (selectedChatModel === "chat-model-reasoning") {
       return `${regularPrompt}\n\n${requestPrompt}\n\n${hubspotPrompt}`;
     }

     return `${regularPrompt}\n\n${requestPrompt}\n\n${artifactsPrompt}\n\n${hubspotPrompt}`;
   };
   ```

4. Optional: Create a custom system prompt template specifically for HubSpot-heavy workflows

---

### Phase 6: Environment Configuration

**Goal**: Ensure all required API keys and secrets are configured

**Steps**:
1. Update `ai_chatbot/.env`:
   ```bash
   # OpenAI
   OPENAI_API_KEY=sk-proj-...

   # HubSpot
   HUBSPOT_ACCESS_TOKEN=pat-na1-...

   # Database (existing)
   POSTGRES_URL=...

   # Auth (existing)
   AUTH_SECRET=...

   # Storage (existing)
   BLOB_READ_WRITE_TOKEN=...

   # Optional: Redis for resumable streams
   # REDIS_URL=...
   ```

2. Verify HubSpot client in deal-agent reads `process.env.HUBSPOT_ACCESS_TOKEN`:
   - Already implemented in `src/tools/hubspot/client.ts`
   - Confirm environment variable is accessible from ChatBot's Node.js runtime

3. **Security note**: Since this is single-user, one shared HubSpot token is fine. For multi-user in future, implement per-user token storage.

---

### Phase 7: End-to-End Testing

**Goal**: Verify the full integration works from UI → tools → HubSpot API

**Test Scenarios**:

1. **Basic Tool Execution**:
   - Start ChatBot: `cd ai_chatbot && pnpm dev`
   - Create new chat
   - Test queries:
     - "List my HubSpot deals" → Should call `list_deals` tool
     - "Show me all deal stages" → Should call `list_deal_stages` tool
     - "What deal properties are available?" → Should call `get_deal_properties` tool
     - "Search for deals in appointmentscheduled stage" → Should call `search_deals` with filter

2. **Multi-Step Reasoning** (Agentic Behavior):
   - "Find deals in the appointmentscheduled stage and tell me which one has been there longest"
   - Expected: Agent calls `search_deals` → analyzes results → responds with oldest deal

3. **Error Handling**:
   - "Update deal stage for deal XYZ to invalidstage"
   - Expected: HubSpot API error → Agent explains error to user gracefully

4. **Streaming Verification**:
   - Confirm text appears progressively (word-by-word)
   - Tool calls show in UI as they execute
   - Final response is coherent and complete

5. **Persistence Verification**:
   - Refresh page
   - Navigate back to same chat
   - Confirm messages are still there
   - Confirm conversation context is maintained

6. **Usage Tracking**:
   - Check that token usage and cost appear in UI
   - Verify usage data is saved to database

**What to verify**:
- ✅ Tool calls execute successfully
- ✅ HubSpot API returns data correctly
- ✅ Streaming text appears smoothly
- ✅ Messages persisted to database
- ✅ Errors logged and displayed appropriately
- ✅ Rate limiter works (test multiple concurrent searches)
- ✅ Multi-step tool chaining works

---

### Phase 8: Architecture for Future Tools (Gmail/Drive/Asana)

**Goal**: Document how to add more tools in the future

**Pattern to Follow**:

1. **In deal-agent**: Create new tool files
   ```
   src/tools/
   ├── hubspot/        (existing)
   ├── gmail/          (future)
   │   ├── client.ts
   │   ├── emails.ts
   │   └── index.ts
   ├── drive/          (future)
   └── asana/          (future)
   ```

2. **Export from index**: Update `src/tools/hubspot/index.ts` pattern for new tools

3. **Import in ChatBot**: Add to `/api/chat/route.ts` following same pattern as HubSpot tools

4. **Update system prompt**: Add section for new tool category

**Design Considerations**:
- Keep tools atomic (one API call per tool)
- Use consistent error handling patterns
- Apply rate limiting where needed
- Export tools in a consistent format
- Tools should work in both CLI (DealAgent) and web (ChatBot) contexts

**Future Tool Candidates**:
- `getEmailsByDealId` - Get Gmail emails related to a deal
- `getDriveFilesByDealId` - Get Google Drive files linked to a deal
- `getAsanaTasksByDealId` - Get Asana tasks for a deal
- `createAsanaTask` - Create task from ChatBot

---

## File Modification Checklist

### Deal Agent (Root Directory)

**Files to Modify**:
- ✅ `package.json` - Update `ai` to `^5.0.26`
- ✅ `src/tools/hubspot/deals.ts` - Change `parameters` → `inputSchema` (4 tools)
- ✅ `src/tools/hubspot/properties.ts` - Change `parameters` → `inputSchema` (2 tools)

**Files Unchanged**:
- ✅ `src/agent/core.ts` - DealAgent class stays as-is for CLI testing
- ✅ `src/tools/base.ts` - Tool registry unchanged
- ✅ `src/tools/hubspot/client.ts` - HubSpot client, rate limiter, error handling unchanged
- ✅ `src/test-agent.ts` - Test suite unchanged (should still pass after v5 upgrade)

### AI ChatBot (ai_chatbot Directory)

**Files to Modify**:
- ✅ `lib/ai/providers.ts` - Replace xAI with OpenAI models
- ✅ `lib/ai/prompts.ts` - Add `hubspotPrompt` section
- ✅ `app/(chat)/api/chat/route.ts` - Import tools, add to streamText, export Node runtime
- ✅ `package.json` - Add `"deal-agent": "workspace:*"` dependency
- ✅ `.env` - Add `OPENAI_API_KEY`, `HUBSPOT_ACCESS_TOKEN`

**Files Unchanged**:
- ✅ All UI components - No changes needed
- ✅ Database schema - No changes needed
- ✅ Auth system - No changes needed
- ✅ Other API routes - No changes needed

### Repo Root

**Files to Create**:
- ✅ `pnpm-workspace.yaml` - Workspace configuration (Phase 3)
- ✅ `INTEGRATION_LOG.md` - Track integration progress (Phase 0)
- ✅ `.gitignore` - Ensure node_modules, .env, etc. are ignored (Phase 0)

**Files to Update**:
- ✅ `integration.md` - This file (updated plan)

**Files to Remove**:
- ✅ `ARCHITECTURE_LOG.md` - Replace with INTEGRATION_LOG.md (Phase 0)

---

## Risks, Gotchas & Mitigations

### 1. AI SDK v5 Upgrade Risk
**Risk**: Documented bugs with v5 schema conversion in ARCHITECTURE_LOG.md
**Mitigation**:
- Test thoroughly with `pnpm run test-agent` before integrating
- Keep v4 code in git history for easy revert
- Fallback: Manually rewrite tools in v5 if agent upgrade fails

### 2. Next.js Workspace Import Issues
**Risk**: Next.js may reject imports from outside `ai_chatbot` directory
**Mitigation**:
- Use pnpm workspace (preferred approach)
- Fallback: Copy compiled tools to `ai_chatbot/lib/agent-tools/`
- Test imports early in Phase 3

### 3. Node.js Runtime Requirement
**Risk**: HubSpot SDK requires Node.js, can't run in Edge runtime
**Mitigation**:
- Export `runtime = 'nodejs'` in chat route (Phase 4)
- Already planned in steps above

### 4. Large HubSpot Payloads
**Risk**: HubSpot can return huge JSON responses, may overwhelm streaming UI
**Mitigation**:
- Let LLM summarize large results (GPT-4o is good at this)
- Future: Add tool-level pagination or result limiting
- Monitor in testing (Phase 7)

### 5. Rate Limiting in Multi-Request Context
**Risk**: HubSpot Search API limited to 5 req/sec, agent has rate limiter for single-user CLI
**Mitigation**:
- Existing rate limiter should work (uses queue-based throttling)
- Monitor in concurrent testing
- Single-user scope reduces risk

### 6. Tool Calling Reliability with OpenAI
**Risk**: LLM might not call tools correctly or hallucinate tool results
**Mitigation**:
- Use GPT-5 models (excellent tool calling support, parallel tool calls)
- gpt-5-mini provides 80% performance at 20% cost while maintaining strong tool calling
- System prompt clearly explains when to use each tool
- Test with diverse queries in Phase 7

---

## Success Criteria

**Must Have** (Required for completion):
- ✅ ChatBot runs locally with OpenAI GPT-5 models (gpt-5-mini for chat, gpt-5-nano for titles)
- ✅ All 6 HubSpot tools callable from ChatBot UI
- ✅ Streaming responses work progressively (word-by-word)
- ✅ Agentic behavior confirmed: Multi-step tool chaining, autonomous tool selection
- ✅ Messages persisted to database correctly
- ✅ `pnpm run test-agent` passes with v5 in deal-agent
- ✅ Basic queries trigger expected tools:
  - "List deals" → list_deals
  - "Show stages" → list_deal_stages
  - "Search for deals in X stage" → search_deals
- ✅ GPT-5 tool calling works reliably (parallel tool calls supported)

**Nice to Have** (Optional enhancements):
- ⭕ Usage tracking with cost calculation works
- ⭕ Error handling graceful for HubSpot API errors
- ⭕ Rate limiter tested with concurrent requests
- ⭕ System prompt refinement based on testing

**Out of Scope** (Future work):
- ❌ Rich UI components for deal data
- ❌ Multi-user authentication
- ❌ Gmail/Drive/Asana tool implementation

---

## Rollback Plan

**If v5 upgrade fails**:
1. Revert `package.json` in deal-agent to v4
2. Revert tool files to use `parameters` instead of `inputSchema`
3. Run `pnpm install` to restore v4 dependencies
4. Alternative path: Manually create v5 tool wrappers in ChatBot that call v4 agent tools via function calls

**If ChatBot integration fails**:
1. DealAgent CLI remains functional (unaffected)
2. ChatBot can revert to xAI Grok (already working baseline)
3. Workspace can be removed (restore original package.json files)

**If OpenAI switch causes issues**:
1. Revert `providers.ts` to use xAI Grok
2. Investigate tool calling differences between OpenAI and xAI
3. Alternative: Use AI Gateway to route only HubSpot queries to OpenAI, keep rest on Grok

---

## Timeline Estimate

**Note**: Timeline is flexible, prioritizing correctness over speed.

- **Phase 0**: Git setup & branch management - 0.25 day
- **Phase 1**: Upgrade & test agent - 0.5-1 day
- **Phase 2**: Switch to OpenAI GPT-5 - 0.5 day
- **Phase 3**: Workspace setup - 0.5 day
- **Phase 4**: Integrate tools - 1 day
- **Phase 5**: System prompt - 0.5 day
- **Phase 6**: Environment config - 0.25 day
- **Phase 7**: E2E testing - 1-2 days
- **Phase 8**: Document future architecture - 0.25 day

**Total**: ~4.5-6.5 days with buffer for debugging

---

## Questions & Open Items

**Resolved**:
- ✅ Use Option C (import tools directly)
- ✅ Switch to OpenAI GPT-5 models (confirmed: gpt-5-mini for chat, gpt-5-nano for titles)
- ✅ Upgrade to v5 (confirmed, with testing)
- ✅ Single-user scope (confirmed)
- ✅ Plain text responses only (confirmed)

**To Confirm During Implementation**:
- ⚠️ Does v5 upgrade work without issues? (Test in Phase 1)
- ⚠️ Does workspace import work in Next.js? (Test in Phase 3)
- ⚠️ Is GPT-5-mini tool calling reliable enough for HubSpot integration? (Test in Phase 7)
- ⚠️ Should we use gpt-5 instead of gpt-5-mini for better performance? (Evaluate cost vs quality)
- ⚠️ Do we need to summarize HubSpot responses? (Evaluate in Phase 7)

---

## Next Steps

1. **Review this plan** - User approves or requests changes
2. **Execute Phase 0** - Initialize git, push to GitHub, create feature branch, start INTEGRATION_LOG.md
3. **Execute Phase 1** - Upgrade agent to v5 and test thoroughly
4. **Proceed sequentially** through phases 2-8
5. **Document learnings** - Update INTEGRATION_LOG.md as each phase completes

**Ready to proceed when approved.** 🚀

---

## Git Workflow Summary

**For AI Agents Working on This Project:**

1. **Starting work**: Always ensure you're on the correct feature branch
   ```bash
   git checkout feature/gpt5-hubspot-integration
   git pull origin feature/gpt5-hubspot-integration
   ```

2. **During work**: Commit frequently with descriptive messages
   ```bash
   git add [files]
   git commit -m "Phase X: [description]"
   ```

3. **After completing a phase**: Push to remote and update INTEGRATION_LOG.md
   ```bash
   git push origin feature/gpt5-hubspot-integration
   ```

4. **When integration is complete**: Create pull request to merge into main
   - Title: "GPT-5 & HubSpot Integration - Option C"
   - Description: Link to integration.md and INTEGRATION_LOG.md
   - Request review before merging

5. **Never commit**:
   - `.env` files (secrets)
   - `node_modules/`
   - `dist/` or build artifacts
   - IDE-specific files (.vscode/, .idea/)

**Branch Strategy**:
- `main` - Stable, production-ready code
- `feature/gpt5-hubspot-integration` - This integration work
- Future features get their own feature branches
