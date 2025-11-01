# Deal Agent Framework

An AI-driven agentic workflow system for unified deal management across HubSpot, Gmail, Google Drive, and Asana.

## 🎯 Project Vision

Instead of forcing users to check multiple systems (HubSpot for CRM, Gmail for emails, Drive for documents, Asana for tasks), the Deal Agent provides a single natural language interface:

```
"What's the status of the Acme Corp deal?"
"Summarize the latest call with them"
"Are there any unanswered emails from this customer?"
"Draft a follow-up email based on our last conversation"
```

The agent intelligently selects and orchestrates atomic tools to accomplish these tasks - **no hardcoded workflows required**.

## 🏗️ Architecture

### Three-Tier Model

1. **Tier 1: Atomic Tools** - Fine-grained, single-purpose functions (one API call each)
2. **Tier 2: Agent Skills** - High-level capabilities described in system prompt
3. **Tier 3: Workflows** - Only for atomic operations (used sparingly)

**Core Principle**: Agent decides **HOW** to accomplish goals by orchestrating tools, not following rigid workflows.

## ✅ Current Status

### Phase 0: Foundation ✅ Complete
- ✅ Project scaffolding with TypeScript + ESM
- ✅ Configuration system with validation
- ✅ Environment variable management

### Phase 1: Core Agent Framework ✅ Complete
- ✅ Agent core with Vercel AI SDK v4
- ✅ Tool registry system
- ✅ Structured logging
- ✅ Mock tools for validation
- ✅ Automated test suite (4/4 tests passing)

### Phase 2: HubSpot Atomic Tools ✅ Complete
- ✅ 6 production-ready HubSpot API tools
- ✅ Real API integration with rate limiting
- ✅ Comprehensive error handling
- ✅ Tools: getDealById, searchDeals, listDeals, updateDealStage, getDealProperties, listDealStages
- ✅ All tests passing with REAL HubSpot data (4/4)

### Phase 3-6: Pending
- ⏳ CLI interface
- ⏳ Gmail/Drive/Asana tools

## 🚀 Quick Start

### Prerequisites
- Node.js >=18.0.0
- PNPM >=9.0.0
- OpenAI API key
- HubSpot Private App access token

### Installation

```bash
# Clone the repository
cd agent_1

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
# - OPENAI_API_KEY
# - HUBSPOT_ACCESS_TOKEN
```

### Running Tests

```bash
# Run agent orchestration tests
pnpm test-agent

# Run TypeScript type checking
pnpm type-check
```

## 📊 Test Results

**Phase 2 Tests - REAL HubSpot API Integration:**

```
✓ Test 1: "What deals do we have?" → Called list_deals (REAL API)
✓ Test 2: "Show me all available deal stages and pipelines" → Called list_deal_stages (REAL API)
✓ Test 3: "Search for deals in the appointmentscheduled stage" → Called search_deals (REAL API)
✓ Test 4: "What deal properties are available in HubSpot?" → Called get_deal_properties (REAL API)

Passed: 4/4 (100%)
All tools successfully calling REAL HubSpot API with proper authentication and rate limiting
```

## ⚠️ Critical Version Requirements

**DO NOT UPGRADE** these versions until AI SDK v5 compatibility is resolved:

```json
{
  "ai": "~4.3.19",
  "@ai-sdk/openai": "~1.3.24"
}
```

**Why?** AI SDK v5 + OpenAI provider v2 uses the `/v1/responses` API which has Zod schema conversion bugs. See `ARCHITECTURE_LOG.md` for details.

## 📁 Project Structure

```
/
├── src/
│   ├── agent/           # Agent core and orchestration
│   │   └── core.ts      # DealAgent class
│   ├── tools/           # Atomic tool implementations
│   │   ├── base.ts      # Tool registry and utilities
│   │   ├── mock.ts      # Mock tools for testing
│   │   └── hubspot/     # HubSpot tools (future)
│   ├── cli/             # CLI interface (future)
│   ├── config/          # Configuration management
│   │   └── index.ts     # Environment variable loader
│   ├── utils/           # Shared utilities
│   │   └── logger.ts    # Structured logging
│   └── test-agent.ts    # Automated test suite
├── docs/                # API integration documentation
│   ├── hubspot_deals_api_docs.md
│   ├── gmail_api_docs.md
│   ├── google_drive_api_docs.md
│   ├── asana_docs.md
│   └── vercel_ai_sdk_docs.md
├── tests/               # Test suites (future)
├── .env.example         # Environment variables template
├── PRD.md               # Product Requirements Document
├── ARCHITECTURE_LOG.md  # Implementation decisions log
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## 🛠️ Development

### Adding a New Tool

Tools should follow the atomic pattern (one API call per tool):

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const myTool = tool({
  description: 'Clear description of what this tool does',
  parameters: z.object({
    param: z.string().describe('Parameter description'),
  }),
  execute: async ({ param }: any) => {
    // Single API call or operation
    const result = await api.call(param);
    return result;
  },
});
```

Then register it:

```typescript
import { toolRegistry } from './tools/base.js';
import { myTool } from './tools/my-tool.js';

toolRegistry.register('my_tool', myTool);
```

### Configuration

All configuration is managed through environment variables. See `.env.example` for available options.

## 📖 Documentation

- **[PRD.md](./PRD.md)** - Product requirements and architecture
- **[ARCHITECTURE_LOG.md](./ARCHITECTURE_LOG.md)** - Implementation decisions and progress
- **[docs/](./docs/)** - API integration guides

## 🧪 Testing

The project includes an automated test suite that validates:
- Tool selection accuracy
- Parameter extraction
- Agent orchestration
- Tool execution

Run tests with: `pnpm test-agent`

## 🚧 Roadmap

### Phase 2: HubSpot Atomic Tools (Next)
- Implement real HubSpot API integrations
- Replace mock tools with production versions
- Add error handling and retries

### Phase 3: CLI Interface
- Interactive chat mode
- Command-based interface (`deal-agent status <dealId>`)
- Colored output and progress indicators

### Phase 4: Agent Skills Enhancement
- Expand system prompt with deal management skills
- Add multi-step reasoning examples
- Implement context awareness

### Phase 5: Testing & Validation
- E2E testing with real APIs
- Performance benchmarking
- Error recovery testing

### Phase 6: Additional Integrations
- Gmail API tools
- Google Drive API tools
- Asana API tools

## 🤝 Contributing

This project follows a structured development approach. Before making changes:

1. Read `PRD.md` to understand the architecture
2. Check `ARCHITECTURE_LOG.md` for implementation decisions
3. Follow the three-tier architecture pattern
4. Keep tools atomic (one API call each)
5. Update tests after adding features

## 📄 License

MIT

## 👤 Author

Adi Tiwari

---

**Status**: Phase 2 Complete ✅
**Last Updated**: 2025-10-31
**Next Milestone**: Phase 3 - CLI Interface
