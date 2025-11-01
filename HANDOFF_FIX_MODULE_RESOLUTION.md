# HANDOFF: Fix Next.js Webpack Module Resolution Issue

**Date Created**: 2025-11-01
**Status**: Investigation Complete - Ready to Execute Fix
**Priority**: CRITICAL - Blocking deployment

---

## Current Situation

The ChatBot integration is **code-complete through Phase 6** but fails to build with:
```
Module not found: Can't resolve 'deal-agent'
```

All HubSpot tools are implemented and the environment is configured. The issue is purely a **build/module resolution problem**.

---

## Root Cause (Fully Diagnosed)

**Chain of Issues:**
1. `src/index.ts` line 22 exports non-existent `Tool` type → TypeScript compilation fails
2. No `dist/index.js` is created because TypeScript build fails
3. `package.json` points to `"main": "dist/index.js"` which doesn't exist
4. Next.js webpack follows symlink to root package but can't find entry point
5. Next.js isn't configured to handle workspace packages (`transpilePackages` missing)

**Evidence Files to Review:**
- `src/index.ts` - Line 22 has the problematic export
- Root `package.json` - Has `"main": "dist/index.js"` but file doesn't exist
- `ai_chatbot/next.config.ts` - Missing `transpilePackages` configuration
- `INTEGRATION_LOG.md` - Complete integration history (Phases 0-6 completed)

---

## The Complete Fix Plan

### Step 1: Fix TypeScript Compilation Error

**File**: `src/index.ts`
**Line**: 22
**Current Code**:
```typescript
export type { Tool, ToolRegistry } from './tools/base.js';
```

**Problem**: `Tool` type doesn't exist in `src/tools/base.ts` (only `ToolResult` and `ToolRegistry` exist)

**Fix**:
```typescript
export type { ToolRegistry } from './tools/base.js';
```

**Verification**: Run `pnpm build` in root - should succeed

---

### Step 2: Add Modern Package Entry Points

**File**: Root `package.json`

**Add these fields** (after "version", before "scripts"):
```json
{
  "name": "deal-agent",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "prepare": "pnpm build",
    // ... existing scripts
  }
}
```

**Purpose**:
- `exports` - Modern Node.js/bundler module resolution
- `types` - TypeScript declaration files
- `files` - Restrict published files to dist/
- `prepare` - Auto-build on `pnpm install` (optional but recommended)

---

### Step 3: Configure Next.js for Monorepo

**File**: `ai_chatbot/next.config.ts`

**Current Code**:
```typescript
const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  images: {
    // ... config
  },
};
```

**Replace with**:
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  transpilePackages: ['deal-agent'],  // ADD THIS LINE
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
```

**Purpose**: `transpilePackages` tells Next.js to process workspace packages (essential for monorepo setups)

---

### Step 4: Add Build Orchestration

**File**: `ai_chatbot/package.json`

**Find the scripts section and add/modify**:
```json
{
  "scripts": {
    "prebuild": "pnpm -w -F deal-agent build",
    "dev": "pnpm -w -F deal-agent build && next dev",
    "build": "tsx lib/db/migrate && next build",
    // ... other scripts unchanged
  }
}
```

**Purpose**:
- `prebuild` - Automatically builds deal-agent before Next.js build
- `dev` - Builds deal-agent before starting dev server
- **Note**: Removed `--turbo` flag (has known issues with workspace setups)

---

### Step 5: Execute the Fix

**Run these commands in order:**

```bash
# 1. Navigate to root
cd C:\Users\Adi\Desktop\agent_1

# 2. Build deal-agent (should succeed after Step 1 fix)
pnpm build

# 3. Verify build output exists
ls -la dist/index.js
ls -la dist/index.d.ts

# 4. Navigate to chatbot
cd ai_chatbot

# 5. Build chatbot (prebuild will run automatically)
pnpm build

# 6. Start production server (OR use pnpm dev for development)
pnpm start
```

**Expected Output**:
- ✅ TypeScript compiles cleanly
- ✅ `dist/index.js` and `dist/index.d.ts` created
- ✅ Next.js build succeeds
- ✅ Server starts at http://localhost:3000

---

## Testing After Fix

Once the server is running, test these HubSpot queries:

1. **"List my HubSpot deals"** → Should call `listDeals` tool
2. **"Show me all deal stages"** → Should call `listDealStages` tool
3. **"Search for deals in appointmentscheduled stage"** → Should call `searchDeals` with filter
4. **"What deal properties are available?"** → Should call `getDealProperties` tool

**What to verify**:
- ✅ Text streams word-by-word
- ✅ Tool calls execute successfully
- ✅ Real HubSpot data is displayed
- ✅ Messages persist after refresh
- ✅ Agentic behavior (AI autonomously selects correct tools)

---

## Integration Context (What's Already Done)

Read `INTEGRATION_LOG.md` for complete history. Summary:

**✅ Phase 0**: Git setup, feature branch created
**✅ Phase 1**: Upgraded to AI SDK v5 (all 6 HubSpot tools migrated)
**✅ Phase 2**: Switched to OpenAI GPT-5 models (gpt-5-mini, gpt-5-nano, gpt-5)
**✅ Phase 3**: pnpm workspace configured (monorepo structure)
**✅ Phase 4**: All 6 HubSpot tools integrated into ChatBot route
**✅ Phase 5**: System prompts updated (AI knows when to use HubSpot tools)
**✅ Phase 6**: Environment variables configured (all API keys added to .env.local)

**🔴 Phase 7**: End-to-End Testing - **BLOCKED by module resolution bug**

---

## Key Files Reference

**Configuration Files**:
- `pnpm-workspace.yaml` - Workspace configuration
- Root `package.json` - deal-agent package config
- `ai_chatbot/package.json` - ChatBot dependencies
- `ai_chatbot/next.config.ts` - Next.js configuration
- `ai_chatbot/.env.local` - Environment variables (NOT in git)

**Source Files**:
- `src/index.ts` - Main package entry (has the bug on line 22)
- `src/tools/hubspot/index.ts` - HubSpot tools export
- `src/tools/hubspot/deals.ts` - 4 deal management tools
- `src/tools/hubspot/properties.ts` - 2 metadata tools
- `ai_chatbot/app/(chat)/api/chat/route.ts` - ChatBot route that imports tools

**Documentation**:
- `INTEGRATION_LOG.md` - Complete integration history with all phases
- `integration.md` - Original integration plan

---

## Success Criteria

**Must Have**:
- [ ] `pnpm build` succeeds in root directory
- [ ] `dist/index.js` and `dist/index.d.ts` exist
- [ ] `pnpm build` succeeds in ai_chatbot directory
- [ ] ChatBot starts without errors
- [ ] HubSpot tools are importable and callable
- [ ] All 6 tools execute against real HubSpot API

**Documentation**:
- [ ] Update `INTEGRATION_LOG.md` with Phase 7 completion
- [ ] Commit all fixes with descriptive message
- [ ] Push to `feature/gpt5-hubspot-integration` branch

---

## Common Pitfalls to Avoid

❌ **Don't** use `--turbo` flag in dev script (has workspace issues)
❌ **Don't** skip the TypeScript fix in Step 1 (prebuild will fail)
❌ **Don't** forget to add `transpilePackages` (Next.js won't process workspace package)
❌ **Don't** commit `.env.local` file (contains secrets, already in .gitignore)

✅ **Do** verify each step completes before moving to next
✅ **Do** run builds from correct directory (root for deal-agent, ai_chatbot for Next.js)
✅ **Do** test with real HubSpot queries after fix

---

## If Issues Arise

**If TypeScript build still fails after Step 1**:
- Check for additional errors beyond the `Tool` export
- Run `pnpm run type-check` to see all errors
- Fix any remaining type issues before proceeding

**If Next.js still can't resolve deal-agent**:
- Verify `dist/index.js` exists in root directory
- Check `transpilePackages` is in next.config.ts
- Try `pnpm install` in ai_chatbot to refresh symlinks

**If builds succeed but tools don't work**:
- Check `.env.local` has `HUBSPOT_ACCESS_TOKEN`
- Verify HubSpot token is valid
- Check browser console for errors

---

## Next Agent Instructions

**START HERE**:
1. Read this entire document
2. Review `INTEGRATION_LOG.md` for context (Phases 0-6)
3. Execute Steps 1-5 in order
4. Test the HubSpot integration
5. Document results in `INTEGRATION_LOG.md` (Phase 7)
6. Commit and push changes

**You have everything you need to complete this fix. Good luck!** 🚀
