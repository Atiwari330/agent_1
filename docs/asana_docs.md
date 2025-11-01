# Asana API Integration Documentation
## For Deal Agent Framework - October 2025

**Target Stack:** Next.js 15, TypeScript 5.x, Vercel AI SDK 5.x, Asana Node.js Client v3.x

---

## Table of Contents

1. [Overview & Authentication](#1-overview--authentication)
2. [Installation & Setup](#2-installation--setup)
3. [Rate Limits & Best Practices](#3-rate-limits--best-practices)
4. [Projects API](#4-projects-api)
5. [Tasks API](#5-tasks-api)
6. [Pagination Patterns](#6-pagination-patterns)
7. [Error Handling](#7-error-handling)
8. [Tool Implementation for Vercel AI SDK](#8-tool-implementation-for-vercel-ai-sdk)
9. [Complete Integration Examples](#9-complete-integration-examples)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview & Authentication

### 1.1 API Fundamentals

**Base URL:** `https://app.asana.com/api/1.0`

**Authentication Method:** Personal Access Token (PAT)
- Tokens are workspace-specific
- Never expire unless manually revoked
- Should be stored securely as environment variables

**Data Format:**
- **Request:** JSON or form-encoded
- **Response:** JSON with consistent structure:
  ```json
  {
    "data": { /* resource object */ },
    "errors": [ /* if any */ ]
  }
  ```

### 1.2 Key Concepts

**GID (Global Identifier):** Every Asana object has a unique `gid` string
- Projects: `"1234567890"`
- Tasks: `"9876543210"`
- Users: `"1122334455"`

**Resource Types:**
- `task` - Individual work items
- `project` - Collections of tasks
- `section` - Organizing units within projects
- `user` - Team members
- `workspace` - Top-level organizational units

**Compact vs Full Objects:**
- By default, list endpoints return "compact" objects with minimal fields (`gid`, `name`, `resource_type`)
- Use `opt_fields` parameter to request additional fields
- Individual GET requests return more complete objects

---

## 2. Installation & Setup

### 2.1 Install Required Packages

```bash
# Using pnpm (recommended for your stack)
pnpm add asana @types/asana

# Or npm
npm install asana @types/asana
```

**Package Versions (October 2025):**
- `asana`: ^3.0.0 (Node.js client library v3)
- `@types/asana`: Latest from DefinitelyTyped

### 2.2 Environment Configuration

Create/update your `.env.local`:

```bash
# Asana Configuration
ASANA_PERSONAL_ACCESS_TOKEN=0/1234567890abcdef...
ASANA_WORKSPACE_GID=1234567890

# For development/testing
ASANA_TEST_PROJECT_GID=9876543210
```

### 2.3 TypeScript Client Setup

**File: `lib/integrations/asana-adapter.ts`**

```typescript
import Asana from 'asana';

/**
 * Asana API Client Configuration
 * 
 * Using the v3 Node.js SDK which provides:
 * - Automatic rate limit handling with retries
 * - Type safety with TypeScript
 * - Pagination support
 * - Error handling
 */

// Initialize the Asana client (singleton pattern)
let asanaClientInstance: typeof Asana.ApiClient.instance | null = null;

export function getAsanaClient() {
  if (!asanaClientInstance) {
    const client = Asana.ApiClient.instance;
    const token = client.authentications['token'];
    
    if (!process.env.ASANA_PERSONAL_ACCESS_TOKEN) {
      throw new Error('ASANA_PERSONAL_ACCESS_TOKEN is not set');
    }
    
    token.accessToken = process.env.ASANA_PERSONAL_ACCESS_TOKEN;
    asanaClientInstance = client;
  }
  
  return asanaClientInstance;
}

// Create API instances for different resources
export function getProjectsApi() {
  const client = getAsanaClient();
  return new Asana.ProjectsApi();
}

export function getTasksApi() {
  const client = getAsanaClient();
  return new Asana.TasksApi();
}

export function getUsersApi() {
  const client = getAsanaClient();
  return new Asana.UsersApi();
}

// Type definitions for common responses
export interface AsanaTask {
  gid: string;
  resource_type: 'task';
  name: string;
  notes?: string;
  html_notes?: string;
  completed: boolean;
  completed_at?: string;
  due_on?: string;
  due_at?: string;
  assignee?: {
    gid: string;
    name: string;
    resource_type: 'user';
  };
  projects?: Array<{
    gid: string;
    name: string;
    resource_type: 'project';
  }>;
  created_at: string;
  modified_at: string;
}

export interface AsanaProject {
  gid: string;
  resource_type: 'project';
  name: string;
  notes?: string;
  archived: boolean;
  color?: string;
  created_at: string;
  modified_at: string;
  current_status?: {
    title: string;
    text: string;
    color: string;
    created_at: string;
  };
}

export interface AsanaPaginatedResponse<T> {
  data: T[];
  next_page?: {
    offset: string;
    path: string;
    uri: string;
  };
}

export interface AsanaErrorResponse {
  errors: Array<{
    message: string;
    help?: string;
    phrase?: string; // For 500 errors, used by Asana support
  }>;
}
```

---

## 3. Rate Limits & Best Practices

### 3.1 Rate Limit Specifications

Asana enforces multiple types of rate limiting, with limits allocated per authorization token. Requests hitting rate limits receive a 429 Too Many Requests response with a Retry-After header indicating seconds to wait before retrying.

**Standard Rate Limits (per minute):**
- **Free domains:** 150 requests/minute
- **Premium domains:** 1,500 requests/minute

**Concurrent Request Limits:**
- **Read requests:** 50 concurrent
- **Write requests:** 15 concurrent

**Cost-Based Limits:**
- Asana imposes additional limits based on computational cost for requests requiring extensive graph traversal to maintain API stability.
- Affects requests that query very large result sets or deeply nested relationships

### 3.2 Rate Limit Headers

Every API response includes these headers:
```
X-RateLimit-Limit: 1500
X-RateLimit-Remaining: 1487
X-RateLimit-Reset: 1698765432
```

On rate limit error (429):
```
Retry-After: 30  # Seconds to wait
```

### 3.3 Retry Strategy Implementation

**File: `lib/integrations/asana-retry.ts`**

```typescript
import { AsanaErrorResponse } from './asana-adapter';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 32000,
};

/**
 * Exponential backoff with jitter for retrying Asana API calls
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      const statusCode = error.status || error.response?.status;
      
      // Don't retry on client errors (4xx except 429)
      if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === config.maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      let delay: number;
      
      if (statusCode === 429 && error.response?.headers?.['retry-after']) {
        // Use Retry-After header if provided
        delay = parseInt(error.response.headers['retry-after'], 10) * 1000;
      } else {
        // Exponential backoff: 2^attempt * baseDelay
        const exponentialDelay = Math.pow(2, attempt) * config.baseDelay;
        // Add jitter: random between 0 and delay
        const jitter = Math.random() * exponentialDelay;
        delay = Math.min(exponentialDelay + jitter, config.maxDelay);
      }
      
      console.log(`Asana API retry attempt ${attempt + 1}/${config.maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Parse Asana error response
 */
export function parseAsanaError(error: any): string {
  if (error.response?.body?.errors) {
    const errors = error.response.body.errors as AsanaErrorResponse['errors'];
    return errors.map(e => e.message).join('; ');
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'Unknown Asana API error';
}

/**
 * Check if error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  const statusCode = error.status || error.response?.status;
  return statusCode === 429;
}

/**
 * Check if error is retryable (5xx or 429)
 */
export function isRetryableError(error: any): boolean {
  const statusCode = error.status || error.response?.status;
  return statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}
```

### 3.4 Best Practices

**1. Use opt_fields to minimize response size**
```typescript
// ❌ Bad: Returns ALL fields (expensive)
await tasksApi.getTask(taskGid, {});

// ✅ Good: Only request what you need
await tasksApi.getTask(taskGid, {
  opt_fields: 'name,notes,completed,due_on,assignee.name'
});
```

**2. Implement request queuing for high-volume operations**
```typescript
import PQueue from 'p-queue';

// Limit concurrent requests to stay under concurrent request limits
const asanaQueue = new PQueue({ 
  concurrency: 10,  // Well under the 50 read limit
  interval: 1000,   // Per second
  intervalCap: 25   // Max 25 requests per second (1500/minute)
});

export async function queuedAsanaRequest<T>(
  operation: () => Promise<T>
): Promise<T> {
  return asanaQueue.add(() => retryWithBackoff(operation));
}
```

**3. Cache responses when appropriate**
```typescript
import { unstable_cache } from 'next/cache';

// Cache project details for 5 minutes
export const getCachedProject = unstable_cache(
  async (projectGid: string) => {
    const projectsApi = getProjectsApi();
    const response = await projectsApi.getProject(projectGid, {
      opt_fields: 'name,notes,archived,created_at,modified_at'
    });
    return response.data;
  },
  ['asana-project'],
  {
    revalidate: 300, // 5 minutes
    tags: ['asana']
  }
);
```

---

## 4. Projects API

### 4.1 Get Project by GID

```typescript
import { getProjectsApi, retryWithBackoff } from '@/lib/integrations/asana-adapter';

export async function getProjectDetails(projectGid: string) {
  const projectsApi = getProjectsApi();
  
  try {
    const response = await retryWithBackoff(() => 
      projectsApi.getProject(projectGid, {
        opt_fields: [
          'name',
          'notes',
          'archived',
          'color',
          'created_at',
          'modified_at',
          'current_status.title',
          'current_status.text',
          'current_status.color',
          'members.name',
          'owner.name'
        ].join(',')
      })
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to get project details:', parseAsanaError(error));
    throw new Error(`Failed to fetch project: ${parseAsanaError(error)}`);
  }
}
```

### 4.2 Get Tasks for Project

This endpoint returns compact task records for all tasks within a project, ordered by priority. Tasks can exist in multiple projects simultaneously.

```typescript
export async function getProjectTasks(
  projectGid: string,
  options: {
    completedSince?: string; // ISO 8601 date
    includeCompleted?: boolean;
    optFields?: string[];
  } = {}
) {
  const tasksApi = getTasksApi();
  
  const optFields = options.optFields || [
    'name',
    'notes',
    'completed',
    'completed_at',
    'due_on',
    'due_at',
    'assignee.name',
    'assignee.email',
    'created_at',
    'modified_at',
    'memberships.section.name'
  ];
  
  try {
    const response = await retryWithBackoff(() =>
      tasksApi.getTasksForProject(projectGid, {
        opt_fields: optFields.join(','),
        completed_since: options.completedSince,
        limit: 100 // Max per page
      })
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to get project tasks:', parseAsanaError(error));
    throw new Error(`Failed to fetch tasks: ${parseAsanaError(error)}`);
  }
}
```

### 4.3 Common opt_fields for Projects

**Minimal (fast):**
```typescript
opt_fields: 'name,archived,color'
```

**Standard (balanced):**
```typescript
opt_fields: 'name,notes,archived,color,created_at,modified_at,current_status.title,current_status.text'
```

**Full (slow, use sparingly):**
```typescript
opt_fields: 'name,notes,archived,color,created_at,modified_at,current_status,members,followers,owner,team,workspace,custom_fields'
```

---

## 5. Tasks API

### 5.1 Get Single Task

```typescript
export async function getTaskDetails(taskGid: string) {
  const tasksApi = getTasksApi();
  
  try {
    const response = await retryWithBackoff(() =>
      tasksApi.getTask(taskGid, {
        opt_fields: [
          'name',
          'notes',
          'html_notes',
          'completed',
          'completed_at',
          'completed_by.name',
          'due_on',
          'due_at',
          'assignee.name',
          'assignee.email',
          'projects.name',
          'created_at',
          'modified_at',
          'dependencies.name',
          'dependents.name',
          'memberships.section.name'
        ].join(',')
      })
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to get task:', parseAsanaError(error));
    throw new Error(`Failed to fetch task: ${parseAsanaError(error)}`);
  }
}
```

### 5.2 Create Task

```typescript
export interface CreateTaskParams {
  name: string;
  notes?: string;
  html_notes?: string;
  projects?: string[]; // Array of project GIDs
  assignee?: string; // User GID or 'me'
  due_on?: string; // YYYY-MM-DD
  due_at?: string; // ISO 8601
}

export async function createTask(params: CreateTaskParams) {
  const tasksApi = getTasksApi();
  
  try {
    const response = await retryWithBackoff(() =>
      tasksApi.createTask({
        data: {
          name: params.name,
          notes: params.notes,
          html_notes: params.html_notes,
          projects: params.projects,
          assignee: params.assignee,
          due_on: params.due_on,
          due_at: params.due_at,
        }
      }, {
        opt_fields: 'gid,name,notes,completed,due_on,assignee.name,projects.name'
      })
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to create task:', parseAsanaError(error));
    throw new Error(`Failed to create task: ${parseAsanaError(error)}`);
  }
}
```

### 5.3 Update Task

```typescript
export interface UpdateTaskParams {
  name?: string;
  notes?: string;
  html_notes?: string;
  completed?: boolean;
  due_on?: string;
  due_at?: string;
  assignee?: string;
}

export async function updateTask(
  taskGid: string,
  updates: UpdateTaskParams
) {
  const tasksApi = getTasksApi();
  
  try {
    const response = await retryWithBackoff(() =>
      tasksApi.updateTask({
        data: updates
      }, taskGid, {
        opt_fields: 'gid,name,notes,completed,due_on,assignee.name,modified_at'
      })
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to update task:', parseAsanaError(error));
    throw new Error(`Failed to update task: ${parseAsanaError(error)}`);
  }
}
```

### 5.4 Search Tasks

```typescript
export interface TaskSearchParams {
  workspace: string; // Required
  assignee?: string;
  projects?: string[];
  completed?: boolean;
  modified_since?: string; // ISO 8601
  completed_since?: string;
  due_on_before?: string;
  due_on_after?: string;
}

export async function searchTasks(params: TaskSearchParams) {
  const tasksApi = getTasksApi();
  
  try {
    const response = await retryWithBackoff(() =>
      tasksApi.searchTasksForWorkspace(params.workspace, {
        'assignee.any': params.assignee,
        'projects.any': params.projects?.join(','),
        'completed': params.completed,
        'modified_since': params.modified_since,
        'completed_since': params.completed_since,
        'due_on.before': params.due_on_before,
        'due_on.after': params.due_on_after,
        'opt_fields': 'gid,name,notes,completed,due_on,assignee.name,projects.name',
        'limit': 100
      })
    );
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to search tasks:', parseAsanaError(error));
    throw new Error(`Failed to search tasks: ${parseAsanaError(error)}`);
  }
}
```

---

## 6. Pagination Patterns

### 6.1 Understanding Asana Pagination

Asana's pagination allows you to page through results up to 100 objects at a time. The API returns a next_page attribute containing an offset when more results exist. If next_page is null, there are no more pages.

**Key Points:**
- Default limit: 10 items (too small for production)
- Maximum limit: 100 items (always use this)
- Offset tokens expire after some time
- V3 Node.js SDK handles pagination automatically

### 6.2 Manual Pagination

```typescript
export async function getAllProjectTasks(projectGid: string) {
  const tasksApi = getTasksApi();
  const allTasks: AsanaTask[] = [];
  let offset: string | undefined;
  
  do {
    try {
      const response = await retryWithBackoff(() =>
        tasksApi.getTasksForProject(projectGid, {
          opt_fields: 'name,completed,due_on,assignee.name',
          limit: 100,
          offset
        })
      );
      
      allTasks.push(...response.data);
      
      // Check for next page
      offset = response.next_page?.offset;
      
    } catch (error: any) {
      console.error('Pagination error:', parseAsanaError(error));
      throw error;
    }
  } while (offset);
  
  return allTasks;
}
```

### 6.3 Async Iterator Pattern (Recommended)

```typescript
export async function* iterateProjectTasks(projectGid: string) {
  const tasksApi = getTasksApi();
  let offset: string | undefined;
  
  do {
    try {
      const response = await retryWithBackoff(() =>
        tasksApi.getTasksForProject(projectGid, {
          opt_fields: 'name,completed,due_on,assignee.name',
          limit: 100,
          offset
        })
      );
      
      // Yield each task
      for (const task of response.data) {
        yield task;
      }
      
      offset = response.next_page?.offset;
      
    } catch (error: any) {
      console.error('Iterator error:', parseAsanaError(error));
      throw error;
    }
  } while (offset);
}

// Usage:
async function processAllTasks(projectGid: string) {
  let count = 0;
  
  for await (const task of iterateProjectTasks(projectGid)) {
    console.log(`Processing task: ${task.name}`);
    // Process task...
    count++;
    
    // Optional: Add progress tracking
    if (count % 50 === 0) {
      console.log(`Processed ${count} tasks...`);
    }
  }
  
  console.log(`Total tasks processed: ${count}`);
}
```

### 6.4 Pagination with Item Limit

```typescript
/**
 * Get a specific number of tasks (stops early)
 */
export async function getTasksWithLimit(
  projectGid: string,
  itemLimit: number
) {
  const tasksApi = getTasksApi();
  const tasks: AsanaTask[] = [];
  let offset: string | undefined;
  
  while (tasks.length < itemLimit) {
    const remaining = itemLimit - tasks.length;
    const limit = Math.min(remaining, 100); // Don't exceed 100 per page
    
    try {
      const response = await retryWithBackoff(() =>
        tasksApi.getTasksForProject(projectGid, {
          opt_fields: 'name,completed,due_on',
          limit,
          offset
        })
      );
      
      tasks.push(...response.data);
      
      // Check if we have more pages and need more items
      if (!response.next_page || tasks.length >= itemLimit) {
        break;
      }
      
      offset = response.next_page.offset;
      
    } catch (error: any) {
      console.error('Pagination error:', parseAsanaError(error));
      throw error;
    }
  }
  
  return tasks.slice(0, itemLimit);
}
```

---

## 7. Error Handling

### 7.1 Common Error Codes

Asana API returns HTTP status codes indicating the nature of failures, with JSON responses containing additional error information.

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad Request | Check request parameters |
| 401 | Unauthorized | Verify access token |
| 403 | Forbidden | Check permissions/access |
| 404 | Not Found | Verify resource exists |
| 429 | Rate Limited | Retry with backoff |
| 500 | Server Error | Retry, contact support if persists |
| 503 | Service Unavailable | Temporary issue, retry |

### 7.2 Error Response Structure

```typescript
// Typical error response
{
  "errors": [
    {
      "message": "project: Missing input",
      "help": "For more information on API status codes...",
    }
  ]
}

// 500 error response (includes phrase for Asana support)
{
  "errors": [
    {
      "message": "Server Error",
      "phrase": "6 sad squid snuggle softly"
    }
  ]
}
```

### 7.3 Comprehensive Error Handler

```typescript
export class AsanaApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public phrase?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AsanaApiError';
  }
}

export async function handleAsanaRequest<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await retryWithBackoff(operation);
  } catch (error: any) {
    const statusCode = error.status || error.response?.status;
    const errorBody = error.response?.body;
    
    // Extract error message
    let message = `Asana API error in ${context}`;
    if (errorBody?.errors?.[0]?.message) {
      message = errorBody.errors[0].message;
    } else if (error.message) {
      message = error.message;
    }
    
    // Extract phrase for 500 errors
    const phrase = errorBody?.errors?.[0]?.phrase;
    
    // Log detailed error
    console.error('Asana API Error:', {
      context,
      statusCode,
      message,
      phrase,
      stack: error.stack
    });
    
    // Throw custom error
    throw new AsanaApiError(message, statusCode, phrase, error);
  }
}

// Usage:
export async function getProjectWithErrorHandling(projectGid: string) {
  return handleAsanaRequest(
    async () => {
      const projectsApi = getProjectsApi();
      const response = await projectsApi.getProject(projectGid, {
        opt_fields: 'name,notes,archived'
      });
      return response.data;
    },
    `getProject(${projectGid})`
  );
}
```

### 7.4 API Route Error Handling (Next.js)

```typescript
// app/api/asana/projects/[projectGid]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getProjectDetails, AsanaApiError } from '@/lib/integrations/asana-adapter';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectGid: string } }
) {
  try {
    const project = await getProjectDetails(params.projectGid);
    
    return NextResponse.json({
      success: true,
      data: project
    });
    
  } catch (error) {
    if (error instanceof AsanaApiError) {
      // Handle Asana-specific errors
      const statusCode = error.statusCode || 500;
      
      return NextResponse.json({
        success: false,
        error: error.message,
        phrase: error.phrase, // For 500 errors
        statusCode
      }, { status: statusCode });
    }
    
    // Handle unexpected errors
    console.error('Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: 'An unexpected error occurred'
    }, { status: 500 });
  }
}
```

---

## 8. Tool Implementation for Vercel AI SDK

### 8.1 Basic Tool Structure

These tools follow the atomic tool pattern from your PRD. Each tool performs ONE operation with the Asana API.

**File: `src/agent/tools/asana.ts`**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import {
  getProjectDetails,
  getProjectTasks,
  getTaskDetails,
  createTask,
  updateTask,
  searchTasks,
  AsanaApiError
} from '@/lib/integrations/asana-adapter';

// ============================================================================
// PROJECT TOOLS
// ============================================================================

export const get_asana_project = tool({
  description: `Fetch details about an Asana project by its GID.
  
  Returns project information including:
  - Name and description
  - Status and creation date
  - Whether it's archived
  - Current project status update
  
  Use this when you need to get project-level information.`,
  
  parameters: z.object({
    project_gid: z.string().describe("The Asana project GID (from the deal record)")
  }),
  
  execute: async ({ project_gid }) => {
    try {
      const project = await getProjectDetails(project_gid);
      
      return {
        success: true,
        project: {
          gid: project.gid,
          name: project.name,
          notes: project.notes,
          archived: project.archived,
          color: project.color,
          created_at: project.created_at,
          modified_at: project.modified_at,
          current_status: project.current_status ? {
            title: project.current_status.title,
            text: project.current_status.text,
            color: project.current_status.color
          } : null
        }
      };
    } catch (error) {
      if (error instanceof AsanaApiError) {
        return {
          success: false,
          error: error.message,
          statusCode: error.statusCode
        };
      }
      return {
        success: false,
        error: 'Failed to fetch project'
      };
    }
  }
});

export const get_project_tasks = tool({
  description: `Get all tasks for a specific Asana project.
  
  Returns:
  - Task name and description
  - Completion status
  - Due date
  - Assignee information
  - Section (if organized)
  
  Use this to see all work items in a project.`,
  
  parameters: z.object({
    project_gid: z.string().describe("The Asana project GID"),
    completed_since: z.string().optional().describe("ISO date to get completed tasks since (e.g., '2025-10-01')"),
    max_tasks: z.number().optional().default(100).describe("Maximum number of tasks to return (default 100)")
  }),
  
  execute: async ({ project_gid, completed_since, max_tasks }) => {
    try {
      const tasks = await getProjectTasks(project_gid, {
        completedSince: completed_since,
        includeCompleted: !!completed_since
      });
      
      // Limit results
      const limitedTasks = tasks.slice(0, max_tasks);
      
      return {
        success: true,
        total_tasks: tasks.length,
        returned_tasks: limitedTasks.length,
        tasks: limitedTasks.map(task => ({
          gid: task.gid,
          name: task.name,
          notes: task.notes,
          completed: task.completed,
          completed_at: task.completed_at,
          due_on: task.due_on,
          due_at: task.due_at,
          assignee: task.assignee ? {
            name: task.assignee.name,
            email: task.assignee.email
          } : null,
          section: task.memberships?.[0]?.section?.name || null,
          created_at: task.created_at,
          modified_at: task.modified_at
        }))
      };
    } catch (error) {
      if (error instanceof AsanaApiError) {
        return {
          success: false,
          error: error.message
        };
      }
      return {
        success: false,
        error: 'Failed to fetch project tasks'
      };
    }
  }
});

// ============================================================================
// TASK TOOLS
// ============================================================================

export const get_asana_task = tool({
  description: `Get detailed information about a specific Asana task.
  
  Returns:
  - Task name and full description
  - Completion status and date
  - Due dates
  - Assignee information
  - Projects the task belongs to
  - Dependencies and dependents
  
  Use this to get full details about a specific task.`,
  
  parameters: z.object({
    task_gid: z.string().describe("The Asana task GID")
  }),
  
  execute: async ({ task_gid }) => {
    try {
      const task = await getTaskDetails(task_gid);
      
      return {
        success: true,
        task: {
          gid: task.gid,
          name: task.name,
          notes: task.notes,
          html_notes: task.html_notes,
          completed: task.completed,
          completed_at: task.completed_at,
          completed_by: task.completed_by?.name,
          due_on: task.due_on,
          due_at: task.due_at,
          assignee: task.assignee ? {
            name: task.assignee.name,
            email: task.assignee.email
          } : null,
          projects: task.projects?.map(p => ({
            gid: p.gid,
            name: p.name
          })) || [],
          created_at: task.created_at,
          modified_at: task.modified_at,
          dependencies: task.dependencies?.map(d => d.name) || [],
          dependents: task.dependents?.map(d => d.name) || []
        }
      };
    } catch (error) {
      if (error instanceof AsanaApiError) {
        return {
          success: false,
          error: error.message
        };
      }
      return {
        success: false,
        error: 'Failed to fetch task'
      };
    }
  }
});

export const create_asana_task = tool({
  description: `Create a new task in Asana.
  
  Can specify:
  - Task name (required)
  - Description/notes
  - Projects to add it to
  - Assignee
  - Due date
  
  Use this to create new tasks based on action items or follow-ups identified.`,
  
  parameters: z.object({
    name: z.string().describe("Task name"),
    notes: z.string().optional().describe("Task description or notes"),
    projects: z.array(z.string()).optional().describe("Array of project GIDs to add task to"),
    assignee: z.string().optional().describe("User GID or 'me' to assign to current user"),
    due_on: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    due_at: z.string().optional().describe("Due datetime in ISO 8601 format")
  }),
  
  execute: async ({ name, notes, projects, assignee, due_on, due_at }) => {
    try {
      const task = await createTask({
        name,
        notes,
        projects,
        assignee,
        due_on,
        due_at
      });
      
      return {
        success: true,
        task: {
          gid: task.gid,
          name: task.name,
          notes: task.notes,
          completed: task.completed,
          due_on: task.due_on,
          assignee: task.assignee?.name,
          projects: task.projects?.map(p => p.name) || []
        }
      };
    } catch (error) {
      if (error instanceof AsanaApiError) {
        return {
          success: false,
          error: error.message
        };
      }
      return {
        success: false,
        error: 'Failed to create task'
      };
    }
  }
});

export const update_asana_task = tool({
  description: `Update an existing Asana task.
  
  Can update:
  - Name
  - Description/notes
  - Completion status
  - Due date
  - Assignee
  
  Use this to mark tasks complete, update details, or reassign.`,
  
  parameters: z.object({
    task_gid: z.string().describe("The task GID to update"),
    updates: z.object({
      name: z.string().optional().describe("New task name"),
      notes: z.string().optional().describe("New notes/description"),
      completed: z.boolean().optional().describe("Mark as completed or not"),
      due_on: z.string().optional().describe("New due date (YYYY-MM-DD)"),
      assignee: z.string().optional().describe("New assignee GID or 'me'")
    }).describe("Fields to update")
  }),
  
  execute: async ({ task_gid, updates }) => {
    try {
      const task = await updateTask(task_gid, updates);
      
      return {
        success: true,
        task: {
          gid: task.gid,
          name: task.name,
          notes: task.notes,
          completed: task.completed,
          due_on: task.due_on,
          assignee: task.assignee?.name,
          modified_at: task.modified_at
        }
      };
    } catch (error) {
      if (error instanceof AsanaApiError) {
        return {
          success: false,
          error: error.message
        };
      }
      return {
        success: false,
        error: 'Failed to update task'
      };
    }
  }
});

export const search_asana_tasks = tool({
  description: `Search for tasks in a workspace with filters.
  
  Can filter by:
  - Assignee
  - Projects
  - Completion status
  - Date ranges (modified, completed, due)
  
  Use this to find specific tasks or analyze task status across projects.`,
  
  parameters: z.object({
    workspace_gid: z.string().describe("The workspace GID to search in"),
    assignee: z.string().optional().describe("User GID or 'me' to filter by assignee"),
    projects: z.array(z.string()).optional().describe("Project GIDs to filter by"),
    completed: z.boolean().optional().describe("Filter by completion status"),
    modified_since: z.string().optional().describe("ISO date - only tasks modified since"),
    completed_since: z.string().optional().describe("ISO date - only tasks completed since"),
    due_on_before: z.string().optional().describe("YYYY-MM-DD - tasks due before"),
    due_on_after: z.string().optional().describe("YYYY-MM-DD - tasks due after"),
    max_results: z.number().optional().default(100).describe("Max results to return")
  }),
  
  execute: async ({ 
    workspace_gid, 
    assignee, 
    projects, 
    completed, 
    modified_since,
    completed_since,
    due_on_before,
    due_on_after,
    max_results 
  }) => {
    try {
      const tasks = await searchTasks({
        workspace: workspace_gid,
        assignee,
        projects,
        completed,
        modified_since,
        completed_since,
        due_on_before,
        due_on_after
      });
      
      const limitedTasks = tasks.slice(0, max_results);
      
      return {
        success: true,
        total_found: tasks.length,
        returned: limitedTasks.length,
        tasks: limitedTasks.map(task => ({
          gid: task.gid,
          name: task.name,
          notes: task.notes,
          completed: task.completed,
          due_on: task.due_on,
          assignee: task.assignee?.name,
          projects: task.projects?.map(p => p.name) || []
        }))
      };
    } catch (error) {
      if (error instanceof AsanaApiError) {
        return {
          success: false,
          error: error.message
        };
      }
      return {
        success: false,
        error: 'Failed to search tasks'
      };
    }
  }
});
```

### 8.2 Exporting Tools for Agent

**File: `src/agent/tools/index.ts`**

```typescript
// Export all Asana tools
export {
  get_asana_project,
  get_project_tasks,
  get_asana_task,
  create_asana_task,
  update_asana_task,
  search_asana_tasks
} from './asana';

// Combined tools object for agent
import * as asanaTools from './asana';
import * as hubspotTools from './hubspot';
import * as gmailTools from './gmail';
import * as driveTools from './drive';
import * as databaseTools from './database';

export const allTools = {
  ...asanaTools,
  ...hubspotTools,
  ...gmailTools,
  ...driveTools,
  ...databaseTools
};
```

---

## 9. Complete Integration Examples

### 9.1 Next.js API Route for Asana Operations

**File: `app/api/deals/[dealId]/asana/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProjectDetails, getProjectTasks } from '@/lib/integrations/asana-adapter';

export async function GET(
  request: NextRequest,
  { params }: { params: { dealId: string } }
) {
  try {
    // Get deal record to find Asana project ID
    const supabase = createSupabaseServerClient();
    const { data: deal, error } = await supabase
      .from('deals')
      .select('id, name, asana_project_id')
      .eq('id', params.dealId)
      .single();
    
    if (error || !deal) {
      return NextResponse.json({
        success: false,
        error: 'Deal not found'
      }, { status: 404 });
    }
    
    if (!deal.asana_project_id) {
      return NextResponse.json({
        success: false,
        error: 'No Asana project linked to this deal'
      }, { status: 400 });
    }
    
    // Fetch Asana data
    const [project, tasks] = await Promise.all([
      getProjectDetails(deal.asana_project_id),
      getProjectTasks(deal.asana_project_id, {
        includeCompleted: false
      })
    ]);
    
    // Analyze task status
    const taskStats = {
      total: tasks.length,
      completed: tasks.filter(t => t.completed).length,
      in_progress: tasks.filter(t => !t.completed && t.assignee).length,
      unassigned: tasks.filter(t => !t.completed && !t.assignee).length,
      overdue: tasks.filter(t => {
        if (!t.due_on || t.completed) return false;
        return new Date(t.due_on) < new Date();
      }).length
    };
    
    return NextResponse.json({
      success: true,
      data: {
        project: {
          gid: project.gid,
          name: project.name,
          status: project.current_status?.text,
          archived: project.archived
        },
        tasks: tasks.slice(0, 20), // Limit response size
        stats: taskStats
      }
    });
    
  } catch (error: any) {
    console.error('Asana API route error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch Asana data'
    }, { status: 500 });
  }
}
```

### 9.2 Server Action for Task Creation

**File: `lib/actions/asana-actions.ts`**

```typescript
'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createTask, AsanaApiError } from '@/lib/integrations/asana-adapter';
import { revalidatePath } from 'next/cache';

export async function createDealTask(
  dealId: string,
  taskData: {
    name: string;
    notes?: string;
    assignee?: string;
    due_on?: string;
  }
) {
  try {
    // Get deal's Asana project
    const supabase = createSupabaseServerClient();
    const { data: deal } = await supabase
      .from('deals')
      .select('asana_project_id')
      .eq('id', dealId)
      .single();
    
    if (!deal?.asana_project_id) {
      return {
        success: false,
        error: 'Deal has no Asana project'
      };
    }
    
    // Create task in Asana
    const task = await createTask({
      name: taskData.name,
      notes: taskData.notes,
      projects: [deal.asana_project_id],
      assignee: taskData.assignee,
      due_on: taskData.due_on
    });
    
    // Log to database
    await supabase.from('deal_interactions').insert({
      deal_id: dealId,
      interaction_type: 'task_created',
      source_system: 'asana',
      source_id: task.gid,
      summary: `Created task: ${task.name}`
    });
    
    // Revalidate deal page
    revalidatePath(`/deals/${dealId}`);
    
    return {
      success: true,
      task: {
        gid: task.gid,
        name: task.name,
        url: `https://app.asana.com/0/${deal.asana_project_id}/${task.gid}`
      }
    };
    
  } catch (error) {
    console.error('Failed to create task:', error);
    
    if (error instanceof AsanaApiError) {
      return {
        success: false,
        error: error.message
      };
    }
    
    return {
      success: false,
      error: 'Failed to create task'
    };
  }
}
```

### 9.3 React Hook for Asana Data

**File: `hooks/use-asana-tasks.ts`**

```typescript
import useSWR from 'swr';
import { AsanaTask } from '@/lib/integrations/asana-adapter';

interface AsanaTasksResponse {
  success: boolean;
  data?: {
    project: {
      gid: string;
      name: string;
      status?: string;
    };
    tasks: AsanaTask[];
    stats: {
      total: number;
      completed: number;
      in_progress: number;
      unassigned: number;
      overdue: number;
    };
  };
  error?: string;
}

export function useAsanaTasks(dealId: string) {
  const { data, error, isLoading, mutate } = useSWR<AsanaTasksResponse>(
    `/api/deals/${dealId}/asana`,
    async (url) => {
      const res = await fetch(url);
      return res.json();
    },
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
      dedupingInterval: 5000
    }
  );
  
  return {
    project: data?.data?.project,
    tasks: data?.data?.tasks || [],
    stats: data?.data?.stats,
    isLoading,
    isError: error || (data && !data.success),
    errorMessage: data?.error || error?.message,
    refresh: mutate
  };
}
```

### 9.4 Agent Tool Usage Example

```typescript
// This shows how the agent will use your Asana tools
import { ToolLoopAgent } from 'ai';
import { allTools } from '@/agent/tools';

const dealAgent = new ToolLoopAgent({
  model: openai('gpt-5'),
  systemPrompt: SYSTEM_PROMPT,
  tools: allTools,
  maxSteps: 20
});

// User query: "What tasks are blocking this deal?"
const response = await dealAgent.run({
  messages: [
    {
      role: 'system',
      content: `DEAL CONTEXT:
        - Deal ID: deal-abc-123
        - Asana Project: 1234567890
        - Workspace: 9876543210
      `
    },
    {
      role: 'user',
      content: 'What tasks are blocking this deal?'
    }
  ]
});

// Agent will:
// 1. Call get_project_tasks with project_gid
// 2. Identify incomplete tasks
// 3. Check for overdue items
// 4. Synthesize a response with blockers
```

---

## 10. Troubleshooting

### 10.1 Common Issues

**Issue: "Invalid token" / 401 errors**
- **Cause:** PAT not set or incorrect
- **Fix:** Verify `ASANA_PERSONAL_ACCESS_TOKEN` in .env.local
- **Test:** Try accessing https://app.asana.com/api/1.0/users/me with your token

**Issue: "Rate limit exceeded" / 429 errors**
- **Cause:** Too many requests too quickly
- **Fix:** Implement retry with backoff (included in examples above)
- **Prevention:** Use request queuing for bulk operations

**Issue: "Pagination token expired"**
- **Cause:** Waited too long between paginated requests
- **Fix:** Restart pagination from beginning
- **Prevention:** Process pages quickly or cache intermediate results

**Issue: "Project/Task not found" / 404 errors**
- **Cause:** GID is wrong or you don't have access
- **Fix:** Verify GID in Asana URL, check permissions
- **Debug:** Log the GID being used

**Issue: "Offset token expired" during iteration**
- **Cause:** Processing large result sets slowly
- **Fix:** Increase processing speed or reduce batch size
- **Alternative:** Store GIDs and fetch individually

### 10.2 Debugging Tools

**Enable Request Logging:**

```typescript
// Add to asana-adapter.ts
import Asana from 'asana';

export function getAsanaClient() {
  if (!asanaClientInstance) {
    const client = Asana.ApiClient.instance;
    const token = client.authentications['token'];
    token.accessToken = process.env.ASANA_PERSONAL_ACCESS_TOKEN!;
    
    // Enable debug logging
    if (process.env.NODE_ENV === 'development') {
      client.authentications['token'].apiKey = token.accessToken;
      client.enableCookies = false;
      
      // Log all requests
      const originalCallApi = client.callApi;
      client.callApi = function(...args) {
        console.log('[Asana API]', args[0], args[1]);
        return originalCallApi.apply(this, args);
      };
    }
    
    asanaClientInstance = client;
  }
  
  return asanaClientInstance;
}
```

**Test Authentication:**

```typescript
// lib/integrations/asana-test.ts
import { getUsersApi } from './asana-adapter';

export async function testAsanaConnection() {
  try {
    const usersApi = getUsersApi();
    const response = await usersApi.getUser('me', {});
    
    console.log('✅ Asana connection successful');
    console.log('User:', response.data.name);
    console.log('Email:', response.data.email);
    
    return { success: true, user: response.data };
  } catch (error: any) {
    console.error('❌ Asana connection failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run in development:
// await testAsanaConnection();
```

### 10.3 Performance Monitoring

```typescript
// lib/integrations/asana-metrics.ts
export class AsanaMetrics {
  private static requestCount = 0;
  private static errorCount = 0;
  private static totalDuration = 0;
  
  static recordRequest(duration: number, error?: boolean) {
    this.requestCount++;
    this.totalDuration += duration;
    if (error) this.errorCount++;
  }
  
  static getStats() {
    return {
      requests: this.requestCount,
      errors: this.errorCount,
      avgDuration: this.requestCount > 0 
        ? this.totalDuration / this.requestCount 
        : 0,
      errorRate: this.requestCount > 0 
        ? this.errorCount / this.requestCount 
        : 0
    };
  }
  
  static reset() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.totalDuration = 0;
  }
}

// Wrap API calls to track metrics
export async function trackAsanaRequest<T>(
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  let error = false;
  
  try {
    return await operation();
  } catch (e) {
    error = true;
    throw e;
  } finally {
    const duration = Date.now() - startTime;
    AsanaMetrics.recordRequest(duration, error);
    
    // Log slow requests
    if (duration > 2000) {
      console.warn(`Slow Asana request: ${duration}ms`);
    }
  }
}
```

### 10.4 Rate Limit Dashboard

```typescript
// app/api/asana/stats/route.ts
import { NextResponse } from 'next/server';
import { AsanaMetrics } from '@/lib/integrations/asana-metrics';

export async function GET() {
  const stats = AsanaMetrics.getStats();
  
  return NextResponse.json({
    ...stats,
    rateLimit: {
      limit: parseInt(process.env.ASANA_RATE_LIMIT || '1500'),
      used: stats.requests,
      remaining: parseInt(process.env.ASANA_RATE_LIMIT || '1500') - stats.requests
    }
  });
}
```

---

## Appendix A: Quick Reference

### Environment Variables

```bash
# Required
ASANA_PERSONAL_ACCESS_TOKEN=your_token_here

# Optional (for workspace-level operations)
ASANA_WORKSPACE_GID=your_workspace_gid
```

### Common GID Patterns

- Projects: Numeric string (e.g., "1234567890")
- Tasks: Numeric string (e.g., "9876543210")
- Users: Numeric string (e.g., "1122334455")

### Rate Limits Summary

- Free: 150 requests/minute
- Premium: 1,500 requests/minute
- Concurrent reads: 50
- Concurrent writes: 15
- Max page size: 100 items

### Essential opt_fields

**For Projects:**
```
name,notes,archived,color,created_at,modified_at,current_status.title,current_status.text
```

**For Tasks:**
```
name,notes,completed,completed_at,due_on,assignee.name,projects.name,created_at,modified_at
```

### HTTP Status Codes

- 200: Success
- 400: Bad request (check parameters)
- 401: Unauthorized (check token)
- 404: Not found (check GID)
- 429: Rate limited (retry with backoff)
- 500: Server error (retry, use phrase for support)

---

## Appendix B: Additional Resources

### Official Documentation
- API Reference: https://developers.asana.com/reference
- Node.js Client: https://github.com/Asana/node-asana
- Developer Forum: https://forum.asana.com/c/developersapi/24

### TypeScript Support
- @types/asana package on DefinitelyTyped
- Type definitions included with official client

### Best Practices
- Always use opt_fields to minimize response size
- Implement exponential backoff for retries
- Use pagination for all list endpoints
- Cache frequently accessed, rarely changing data
- Monitor rate limit usage
- Log errors with context for debugging

---

**Document Version:** 1.0  
**Last Updated:** October 31, 2025  
**Asana API Version:** v1.0  
**Node.js Client Version:** v3.x  
**Status:** Production Ready

---

## Document Summary

This documentation provides everything needed to integrate Asana API into your Deal Agent Framework:

✅ **Authentication** - PAT setup with TypeScript client
✅ **Rate Limiting** - Comprehensive retry and backoff strategies
✅ **Projects & Tasks** - All CRUD operations with examples
✅ **Pagination** - Manual and iterator patterns
✅ **Error Handling** - Production-ready error management
✅ **Vercel AI SDK Tools** - Ready-to-use tool implementations
✅ **Next.js Integration** - API routes, server actions, React hooks
✅ **Troubleshooting** - Common issues and debugging tools

All examples are TypeScript-based and follow your PRD's architecture patterns.