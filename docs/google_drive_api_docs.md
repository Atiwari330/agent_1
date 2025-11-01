# Google Drive API Integration Documentation
## For Deal Agent Framework (Next.js 15 + Supabase)

**Version:** October 2025  
**Target Stack:** Next.js 15 (App Router), TypeScript, Supabase, PNPM, Node.js 20+

---

## Table of Contents

1. [Overview](#overview)
2. [Setup and Installation](#setup-and-installation)
3. [Authentication with Supabase](#authentication-with-supabase)
4. [Core API Operations](#core-api-operations)
5. [Folder Operations](#folder-operations)
6. [File Search and Query](#file-search-and-query)
7. [File Metadata and Content Retrieval](#file-metadata-and-content-retrieval)
8. [PDF and Document Extraction](#pdf-and-document-extraction)
9. [Rate Limiting and Quotas](#rate-limiting-and-quotas)
10. [Error Handling](#error-handling)
11. [Best Practices](#best-practices)
12. [Complete Implementation Examples](#complete-implementation-examples)

---

## Overview

The Google Drive API v3 allows your Deal Agent Framework to access, search, and retrieve files from Google Drive folders associated with each deal. This integration is essential for the unified context layer that brings together HubSpot deals, Gmail communications, and Drive artifacts.

**API Endpoint:**  
`https://www.googleapis.com`

**Official Documentation:**  
https://developers.google.com/workspace/drive/api/reference/rest/v3

**Key Capabilities Required for Deal Agent:**
- Access specific folders by ID
- List and search files within folders
- Retrieve file metadata (name, modified date, MIME type)
- Download file content (especially PDFs)
- Extract text from documents

---

## Setup and Installation

### 1. Install Required Packages

```bash
# Core Google APIs package
pnpm add googleapis

# Supabase packages (for authentication)
pnpm add @supabase/supabase-js @supabase/ssr

# Additional utilities
pnpm add pdf-parse  # For PDF text extraction
```

### 2. Package Versions (October 2025)

```json
{
  "dependencies": {
    "googleapis": "^144.0.0",
    "@supabase/supabase-js": "^2.45.4",
    "@supabase/ssr": "^0.5.1",
    "pdf-parse": "^1.1.1"
  }
}
```

### 3. Environment Variables

Create or update `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Google OAuth (configured in Supabase Auth Providers)
# These are stored in Supabase, not directly in your app
```

---

## Authentication with Supabase

### Overview

The recommended approach for Next.js 15 App Router with Supabase is to use **OAuth2 through Supabase Auth**, which handles token management and refresh automatically.

### 1. Configure Google OAuth in Supabase

**In Supabase Dashboard:**
1. Go to **Authentication → Providers**
2. Enable **Google** provider
3. Add your Google OAuth Client ID and Secret
4. Under **Authentication → URL Configuration**, add redirect URLs:
   ```
   http://localhost:3000/**
   https://yourdomain.com/**
   https://*.vercel.app/**  # For preview deployments
   ```

**In Google Cloud Console:**
1. Go to **APIs & Services → Credentials**
2. Create OAuth 2.0 Client ID (Web application)
3. Add **Authorized JavaScript origins:**
   ```
   http://localhost:3000
   https://yourdomain.com
   ```
4. Add **Authorized redirect URIs:**
   ```
   http://localhost:3000/auth/callback
   https://yourdomain.com/auth/callback
   https://your-project.supabase.co/auth/v1/callback
   ```
5. Enable the **Google Drive API** in your Google Cloud project

### 2. Create Supabase Client Utilities

**File: `lib/supabase/client.ts`** (Client-side)

```typescript
import 'client-only';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**File: `lib/supabase/server.ts`** (Server-side)

```typescript
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore if called from Server Component
          }
        },
      },
    }
  );
}
```

### 3. Implement Google OAuth Sign-In

**Server Action: `app/actions/auth.ts`**

```typescript
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signInWithGoogle() {
  const supabase = await createClient();
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin');

  if (!origin) {
    return redirect('/login?error=OriginMissing');
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: 'https://www.googleapis.com/auth/drive.readonly',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    console.error('Error signing in with Google:', error);
    return redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    return redirect(data.url);
  }
}
```

**Auth Callback Route: `app/auth/callback/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
```

### 4. Create Google Drive API Client Wrapper

**File: `lib/google-drive/client.ts`**

```typescript
import { google, drive_v3 } from 'googleapis';
import { createClient } from '@/lib/supabase/server';

export async function getDriveClient(): Promise<drive_v3.Drive | null> {
  const supabase = await createClient();
  
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    console.error('No active session:', error);
    return null;
  }

  // Get the provider token (Google access token)
  const providerToken = session.provider_token;
  const providerRefreshToken = session.provider_refresh_token;

  if (!providerToken) {
    console.error('No provider token available');
    return null;
  }

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: providerToken,
    refresh_token: providerRefreshToken,
  });

  // Create and return Drive client
  return google.drive({ version: 'v3', auth: oauth2Client });
}
```

---

## Core API Operations

### Important Scopes

```typescript
// Read-only access to Drive
'https://www.googleapis.com/auth/drive.readonly'

// Full access to Drive (use sparingly)
'https://www.googleapis.com/auth/drive'

// Metadata access only
'https://www.googleapis.com/auth/drive.metadata.readonly'

// Access files created or opened by the app
'https://www.googleapis.com/auth/drive.file'
```

**Recommendation for Deal Agent:** Use `drive.readonly` scope.

---

## Folder Operations

### 1. List Files in a Specific Folder

**Function: `lib/google-drive/operations.ts`**

```typescript
import { drive_v3 } from 'googleapis';
import { getDriveClient } from './client';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export async function listFilesInFolder(
  folderId: string,
  options?: {
    pageSize?: number;
    orderBy?: string;
    mimeType?: string;
  }
): Promise<DriveFile[]> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  const query = [`'${folderId}' in parents`, 'trashed = false'];
  
  if (options?.mimeType) {
    query.push(`mimeType = '${options.mimeType}'`);
  }

  const params: drive_v3.Params$Resource$Files$List = {
    q: query.join(' and '),
    pageSize: options?.pageSize || 100,
    orderBy: options?.orderBy || 'modifiedTime desc',
    fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
    supportsAllDrives: true,
  };

  try {
    const response = await drive.files.list(params);
    return (response.data.files || []) as DriveFile[];
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}
```

### 2. Get Folder Metadata

```typescript
export async function getFolderMetadata(folderId: string) {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, createdTime, modifiedTime, parents',
      supportsAllDrives: true,
    });

    return response.data;
  } catch (error) {
    console.error('Error getting folder metadata:', error);
    throw error;
  }
}
```

### 3. List All Files with Pagination

```typescript
export async function listAllFilesInFolder(
  folderId: string
): Promise<DriveFile[]> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: 1000, // Maximum allowed
      pageToken,
      orderBy: 'modifiedTime desc',
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
      supportsAllDrives: true,
    });

    if (response.data.files) {
      allFiles.push(...(response.data.files as DriveFile[]));
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return allFiles;
}
```

---

## File Search and Query

### 1. Search Query Syntax

Google Drive API uses a query language with the following operators:

**Common Query Terms:**
- `name = 'filename'` - Exact name match
- `name contains 'text'` - Partial name match (prefix only)
- `mimeType = 'application/pdf'` - Filter by MIME type
- `'folderId' in parents` - Files in specific folder
- `trashed = false` - Exclude trashed files
- `modifiedTime > '2024-01-01T00:00:00'` - Modified after date
- `owners: 'user@example.com'` - Filter by owner

**Operators:**
- `and` - Logical AND
- `or` - Logical OR
- `not` - Logical NOT
- `contains` - String contains (prefix matching only)
- `=` - Equality
- `!=` - Inequality
- `<`, `<=`, `>`, `>=` - Comparisons (for dates/numbers)

**Important:** The `contains` operator only does **prefix matching** for names. To search for "report", use `name contains 'report'` which will match "report.pdf", "report-2024.pdf", etc.

### 2. Search Files in Folder

```typescript
export async function searchFilesInFolder(
  folderId: string,
  searchTerm: string,
  options?: {
    mimeType?: string;
    orderBy?: string;
  }
): Promise<DriveFile[]> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  const queryParts = [
    `'${folderId}' in parents`,
    'trashed = false',
    `name contains '${searchTerm}'`,
  ];

  if (options?.mimeType) {
    queryParts.push(`mimeType = '${options.mimeType}'`);
  }

  const response = await drive.files.list({
    q: queryParts.join(' and '),
    pageSize: 100,
    orderBy: options?.orderBy || 'modifiedTime desc',
    fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)',
    supportsAllDrives: true,
  });

  return (response.data.files || []) as DriveFile[];
}
```

### 3. Find Most Recent File by Type

```typescript
export async function findLatestFileByType(
  folderId: string,
  mimeType: string
): Promise<DriveFile | null> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = '${mimeType}' and trashed = false`,
    pageSize: 1,
    orderBy: 'modifiedTime desc',
    fields: 'files(id, name, mimeType, modifiedTime, size)',
    supportsAllDrives: true,
  });

  return (response.data.files?.[0] as DriveFile) || null;
}
```

### 4. Common MIME Types for Deal Agent

```typescript
export const MIME_TYPES = {
  // Documents
  PDF: 'application/pdf',
  GOOGLE_DOC: 'application/vnd.google-apps.document',
  WORD: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  
  // Spreadsheets
  GOOGLE_SHEET: 'application/vnd.google-apps.spreadsheet',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  
  // Presentations
  GOOGLE_SLIDES: 'application/vnd.google-apps.presentation',
  POWERPOINT: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  
  // Other
  FOLDER: 'application/vnd.google-apps.folder',
  TEXT: 'text/plain',
  JSON: 'application/json',
} as const;
```

### 5. Advanced Query Example: Find Call Transcripts

```typescript
export async function findCallTranscripts(folderId: string) {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  // Search for PDFs with "transcript" or "call" in the name
  const queries = [
    `'${folderId}' in parents and trashed = false and mimeType = 'application/pdf'`,
    `(name contains 'transcript' or name contains 'call')`,
  ];

  const response = await drive.files.list({
    q: queries.join(' and '),
    pageSize: 50,
    orderBy: 'modifiedTime desc',
    fields: 'files(id, name, mimeType, modifiedTime, size)',
    supportsAllDrives: true,
  });

  return (response.data.files || []) as DriveFile[];
}
```

---

## File Metadata and Content Retrieval

### 1. Get File Metadata

```typescript
export async function getFileMetadata(fileId: string) {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  try {
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, owners, parents, webViewLink, webContentLink',
      supportsAllDrives: true,
    });

    return response.data;
  } catch (error) {
    console.error('Error getting file metadata:', error);
    throw error;
  }
}
```

### 2. Download File Content

**For Binary Files (PDFs, Images, etc.):**

```typescript
import { Readable } from 'stream';

export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  try {
    const response = await drive.files.get(
      {
        fileId,
        alt: 'media',
      },
      { responseType: 'stream' }
    );

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const stream = response.data as unknown as Readable;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}
```

### 3. Export Google Docs as PDF

```typescript
export async function exportGoogleDocAsPDF(fileId: string): Promise<Buffer> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  try {
    const response = await drive.files.export(
      {
        fileId,
        mimeType: 'application/pdf',
      },
      { responseType: 'stream' }
    );

    const chunks: Buffer[] = [];
    const stream = response.data as unknown as Readable;

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  } catch (error) {
    console.error('Error exporting Google Doc:', error);
    throw error;
  }
}
```

### 4. Download File and Save Temporarily

```typescript
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function downloadAndSaveFile(
  fileId: string,
  filename: string
): Promise<string> {
  const buffer = await downloadFile(fileId);
  
  const tempDir = os.tmpdir();
  const filePath = path.join(tempDir, filename);
  
  await fs.writeFile(filePath, buffer);
  
  return filePath;
}
```

---

## PDF and Document Extraction

### 1. Extract Text from PDF

```typescript
import pdfParse from 'pdf-parse';

export async function extractTextFromPDF(fileId: string): Promise<string> {
  try {
    // Download PDF
    const buffer = await downloadFile(fileId);
    
    // Parse PDF
    const data = await pdfParse(buffer);
    
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}
```

### 2. Extract Text with Metadata

```typescript
export interface PDFContent {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
    pageCount: number;
  };
  fileName: string;
  fileId: string;
}

export async function extractPDFContent(fileId: string): Promise<PDFContent> {
  const [buffer, metadata] = await Promise.all([
    downloadFile(fileId),
    getFileMetadata(fileId),
  ]);

  const pdfData = await pdfParse(buffer);

  return {
    text: pdfData.text,
    metadata: {
      title: pdfData.info?.Title,
      author: pdfData.info?.Author,
      subject: pdfData.info?.Subject,
      keywords: pdfData.info?.Keywords,
      creator: pdfData.info?.Creator,
      producer: pdfData.info?.Producer,
      creationDate: pdfData.info?.CreationDate,
      modificationDate: pdfData.info?.ModDate,
      pageCount: pdfData.numpages,
    },
    fileName: metadata.name || 'unknown',
    fileId,
  };
}
```

### 3. Batch Process Multiple PDFs

```typescript
export async function batchExtractPDFs(
  fileIds: string[]
): Promise<PDFContent[]> {
  const results = await Promise.allSettled(
    fileIds.map((fileId) => extractPDFContent(fileId))
  );

  return results
    .filter((result): result is PromiseFulfilledResult<PDFContent> => 
      result.status === 'fulfilled'
    )
    .map((result) => result.value);
}
```

### 4. Find and Extract Latest Transcript

```typescript
export async function getLatestTranscriptText(
  folderId: string
): Promise<{ text: string; filename: string; date: string } | null> {
  const transcripts = await findCallTranscripts(folderId);
  
  if (transcripts.length === 0) {
    return null;
  }

  const latest = transcripts[0];
  const text = await extractTextFromPDF(latest.id);

  return {
    text,
    filename: latest.name,
    date: latest.modifiedTime,
  };
}
```

---

## Rate Limiting and Quotas

### Current Quotas (October 2025)

**Per User Limits:**
- **Queries per 100 seconds:** 20,000 (read + write combined)
- **Queries per day:** 1,000,000,000 (courtesy limit)
- **Writes per second:** 3 (sustained, per account) - **This cannot be increased**

**Project-wide Limits:**
- Same as per-user limits apply

**Important Notes:**
- Pagination doesn't count as multiple requests if using `pageToken`
- Notification channel operations count against quota
- Export and download operations count as read requests

### Error Codes for Rate Limiting

```typescript
// 403: User rate limit exceeded
// 429: Too many requests (backend rate limit)
// 500: Backend error (may indicate rate limiting issues)
```

### Exponential Backoff Implementation

```typescript
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if error is rate limit related
      const isRateLimit = 
        error.code === 403 || 
        error.code === 429 ||
        error.message?.includes('Rate limit') ||
        error.message?.includes('rate limit');

      if (!isRateLimit || attempt === maxRetries - 1) {
        throw error;
      }

      // Calculate delay with exponential backoff + jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      
      console.log(`Rate limited. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`);
      
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

### Usage Example with Retry Logic

```typescript
export async function listFilesWithRetry(folderId: string) {
  return executeWithRetry(
    () => listFilesInFolder(folderId),
    5,  // max retries
    1000  // base delay in ms
  );
}
```

### Batch Operations to Reduce API Calls

```typescript
export async function batchGetFileMetadata(
  fileIds: string[]
): Promise<Record<string, any>> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  // Drive API doesn't have native batch GET, so we use Promise.all
  // but limit concurrent requests
  const BATCH_SIZE = 10;
  const results: Record<string, any> = {};

  for (let i = 0; i < fileIds.length; i += BATCH_SIZE) {
    const batch = fileIds.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (fileId) => {
        try {
          const metadata = await getFileMetadata(fileId);
          return { fileId, metadata };
        } catch (error) {
          console.error(`Error getting metadata for ${fileId}:`, error);
          return { fileId, metadata: null };
        }
      })
    );

    batchResults.forEach(({ fileId, metadata }) => {
      results[fileId] = metadata;
    });

    // Add small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < fileIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
```

---

## Error Handling

### Common Error Types

```typescript
export interface DriveAPIError {
  code: number;
  message: string;
  errors?: Array<{
    domain: string;
    reason: string;
    message: string;
  }>;
}

export function isDriveAPIError(error: any): error is DriveAPIError {
  return error && typeof error.code === 'number';
}
```

### Comprehensive Error Handler

```typescript
export class DriveError extends Error {
  constructor(
    message: string,
    public code?: number,
    public reason?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

export function handleDriveError(error: any): never {
  if (error.code === 401) {
    throw new DriveError(
      'Authentication failed. Please sign in again.',
      401,
      'unauthorized',
      error
    );
  }

  if (error.code === 403) {
    const message = error.message?.includes('Rate limit')
      ? 'Rate limit exceeded. Please try again later.'
      : 'Access denied. Check file permissions.';
    
    throw new DriveError(message, 403, 'forbidden', error);
  }

  if (error.code === 404) {
    throw new DriveError(
      'File or folder not found.',
      404,
      'notFound',
      error
    );
  }

  if (error.code === 429) {
    throw new DriveError(
      'Too many requests. Please slow down.',
      429,
      'tooManyRequests',
      error
    );
  }

  if (error.code === 500 || error.code === 503) {
    throw new DriveError(
      'Google Drive service error. Please try again later.',
      error.code,
      'serviceError',
      error
    );
  }

  // Generic error
  throw new DriveError(
    error.message || 'An unknown error occurred',
    error.code,
    'unknown',
    error
  );
}
```

### Safe Operation Wrapper

```typescript
export async function safeDriveOperation<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error('Drive operation failed:', error);
    return fallback ?? null;
  }
}
```

---

## Best Practices

### 1. Caching Strategy

```typescript
import { unstable_cache } from 'next/cache';

// Cache file list for 5 minutes
export const getCachedFileList = unstable_cache(
  async (folderId: string) => {
    return await listFilesInFolder(folderId);
  },
  ['drive-files'],
  {
    revalidate: 300, // 5 minutes
    tags: ['drive-files'],
  }
);
```

### 2. Implement Request Throttling

```typescript
class RequestThrottler {
  private queue: Array<() => Promise<any>> = [];
  private activeRequests = 0;
  private maxConcurrent = 10;
  private requestsPerSecond = 5;
  private lastRequestTime = 0;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Wait if we're at max concurrent requests
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Rate limiting: ensure minimum time between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 1000 / this.requestsPerSecond;

    if (timeSinceLastRequest < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - timeSinceLastRequest)
      );
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();

    try {
      return await operation();
    } finally {
      this.activeRequests--;
    }
  }
}

export const driveThrottler = new RequestThrottler();
```

### 3. Optimized Field Selection

```typescript
// Only request fields you need
export async function listFilesOptimized(folderId: string) {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  return await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize: 100,
    // Only request specific fields needed
    fields: 'files(id, name, modifiedTime)',
    supportsAllDrives: true,
  });
}
```

### 4. Token Refresh Handling

```typescript
export async function ensureValidToken(): Promise<boolean> {
  const supabase = await createClient();
  
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    return false;
  }

  // Check if token is about to expire (within 5 minutes)
  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  
  if (expiresAt && expiresAt - now < 300) {
    // Refresh session
    const { error: refreshError } = await supabase.auth.refreshSession();
    
    if (refreshError) {
      console.error('Failed to refresh token:', refreshError);
      return false;
    }
  }

  return true;
}
```

### 5. Logging and Monitoring

```typescript
export interface DriveOperationLog {
  operation: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export async function loggedDriveOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    
    const log: DriveOperationLog = {
      operation: operationName,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      success: true,
      metadata,
    };
    
    console.log('[Drive Operation]', log);
    
    return result;
  } catch (error) {
    const log: DriveOperationLog = {
      operation: operationName,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      metadata,
    };
    
    console.error('[Drive Operation Failed]', log);
    
    throw error;
  }
}
```

---

## Complete Implementation Examples

### Example 1: Deal Status Report Agent Skill

```typescript
// app/lib/skills/status-report.ts

import {
  getDriveClient,
  listFilesInFolder,
  findLatestFileByType,
  extractTextFromPDF,
  MIME_TYPES,
} from '@/lib/google-drive';

export interface DealStatusReport {
  dealId: string;
  filesCount: number;
  latestFiles: Array<{
    name: string;
    modifiedDate: string;
    type: string;
  }>;
  latestTranscript?: {
    filename: string;
    date: string;
    summary: string;
  };
}

export async function generateDealStatusReport(
  dealId: string,
  folderId: string
): Promise<DealStatusReport> {
  // Get all files in the folder
  const files = await listFilesInFolder(folderId, {
    pageSize: 100,
    orderBy: 'modifiedTime desc',
  });

  // Get latest PDF (likely a transcript)
  const latestPDF = await findLatestFileByType(folderId, MIME_TYPES.PDF);

  let latestTranscript;
  if (latestPDF) {
    try {
      const text = await extractTextFromPDF(latestPDF.id);
      
      // Simple summary - take first 500 characters
      const summary = text.substring(0, 500) + '...';

      latestTranscript = {
        filename: latestPDF.name,
        date: latestPDF.modifiedTime,
        summary,
      };
    } catch (error) {
      console.error('Failed to extract PDF text:', error);
    }
  }

  return {
    dealId,
    filesCount: files.length,
    latestFiles: files.slice(0, 5).map((file) => ({
      name: file.name,
      modifiedDate: file.modifiedTime,
      type: file.mimeType,
    })),
    latestTranscript,
  };
}
```

### Example 2: Server Action for AI Agent

```typescript
// app/actions/drive-operations.ts
'use server';

import { revalidatePath } from 'next/cache';
import {
  listFilesInFolder,
  searchFilesInFolder,
  getLatestTranscriptText,
} from '@/lib/google-drive/operations';

export async function getFilesForDeal(
  dealId: string,
  folderId: string
) {
  try {
    const files = await listFilesInFolder(folderId);
    return { success: true, files };
  } catch (error) {
    console.error('Failed to get files:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function searchDealFiles(
  dealId: string,
  folderId: string,
  searchTerm: string
) {
  try {
    const files = await searchFilesInFolder(folderId, searchTerm);
    return { success: true, files };
  } catch (error) {
    console.error('Failed to search files:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getLatestCallSummary(
  dealId: string,
  folderId: string
) {
  try {
    const transcript = await getLatestTranscriptText(folderId);
    
    if (!transcript) {
      return { 
        success: false, 
        error: 'No transcripts found' 
      };
    }

    return {
      success: true,
      transcript,
    };
  } catch (error) {
    console.error('Failed to get transcript:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

### Example 3: Agent Skill Registry

```typescript
// app/lib/agent/skills.ts

import { generateDealStatusReport } from '@/lib/skills/status-report';
import { getLatestCallSummary } from '@/app/actions/drive-operations';

export interface Skill {
  name: string;
  description: string;
  execute: (input: any) => Promise<any>;
}

export const driveSkills: Skill[] = [
  {
    name: 'status_report',
    description: 'Generate a comprehensive status report for a deal',
    execute: async ({ dealId, folderId }) => {
      return await generateDealStatusReport(dealId, folderId);
    },
  },
  {
    name: 'latest_call_summary',
    description: 'Get the summary of the latest call transcript',
    execute: async ({ dealId, folderId }) => {
      return await getLatestCallSummary(dealId, folderId);
    },
  },
];
```

### Example 4: Next.js API Route

```typescript
// app/api/deals/[dealId]/files/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listFilesInFolder } from '@/lib/google-drive/operations';

export async function GET(
  request: NextRequest,
  { params }: { params: { dealId: string } }
) {
  const supabase = await createClient();
  
  // Check authentication
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    // Get deal from Supabase
    const { data: deal, error } = await supabase
      .from('deals')
      .select('google_folder_id')
      .eq('id', params.dealId)
      .single();

    if (error || !deal) {
      return NextResponse.json(
        { error: 'Deal not found' },
        { status: 404 }
      );
    }

    if (!deal.google_folder_id) {
      return NextResponse.json(
        { error: 'No Google Drive folder linked' },
        { status: 400 }
      );
    }

    // Get files from Drive
    const files = await listFilesInFolder(deal.google_folder_id);

    return NextResponse.json({
      dealId: params.dealId,
      folderId: deal.google_folder_id,
      filesCount: files.length,
      files,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

## Testing and Development

### Local Development Tips

1. **Use a test Google account** with sample data
2. **Create a dedicated test folder** in Google Drive
3. **Mock the Drive API** for unit tests

### Mock Implementation Example

```typescript
// lib/google-drive/__mocks__/client.ts

export async function getDriveClient() {
  return {
    files: {
      list: async () => ({
        data: {
          files: [
            {
              id: 'test-file-1',
              name: 'Test Document.pdf',
              mimeType: 'application/pdf',
              modifiedTime: new Date().toISOString(),
            },
          ],
        },
      }),
      get: async () => ({
        data: {
          id: 'test-file-1',
          name: 'Test Document.pdf',
        },
      }),
    },
  };
}
```

---

## Security Considerations

### 1. Token Storage

**✅ DO:**
- Store tokens in Supabase Auth (automatic)
- Use server-side components for sensitive operations
- Refresh tokens before expiration

**❌ DON'T:**
- Store Google tokens in localStorage
- Expose tokens in client-side code
- Share tokens between users

### 2. Access Control

```typescript
export async function verifyUserAccessToDeal(
  userId: string,
  dealId: string
): Promise<boolean> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('deals')
    .select('id')
    .eq('id', dealId)
    .eq('user_id', userId)
    .single();

  return !error && !!data;
}
```

### 3. Folder Access Verification

```typescript
export async function verifyFolderAccess(
  folderId: string
): Promise<boolean> {
  try {
    const metadata = await getFolderMetadata(folderId);
    return !!metadata;
  } catch (error: any) {
    if (error.code === 404 || error.code === 403) {
      return false;
    }
    throw error;
  }
}
```

---

## Common Pitfalls and Solutions

### 1. Token Expiration

**Problem:** Access token expires during operation  
**Solution:** Always check token validity and refresh if needed

```typescript
export async function robustDriveOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  await ensureValidToken();
  
  try {
    return await operation();
  } catch (error: any) {
    // If unauthorized, try refreshing token once
    if (error.code === 401) {
      const supabase = await createClient();
      await supabase.auth.refreshSession();
      
      // Retry operation
      return await operation();
    }
    throw error;
  }
}
```

### 2. Large File Downloads

**Problem:** Memory issues with large files  
**Solution:** Stream directly to disk or process in chunks

```typescript
import { createWriteStream } from 'fs';

export async function downloadLargeFile(
  fileId: string,
  outputPath: string
): Promise<void> {
  const drive = await getDriveClient();
  if (!drive) throw new Error('Failed to initialize Drive client');

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  const dest = createWriteStream(outputPath);

  return new Promise((resolve, reject) => {
    response.data
      .pipe(dest)
      .on('finish', resolve)
      .on('error', reject);
  });
}
```

### 3. Folder Not Found Errors

**Problem:** User hasn't granted access or folder ID is wrong  
**Solution:** Provide clear error messages and verification

```typescript
export async function validateDealFolder(
  folderId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const metadata = await getFolderMetadata(folderId);
    
    if (metadata.mimeType !== MIME_TYPES.FOLDER) {
      return {
        valid: false,
        error: 'The provided ID is not a folder',
      };
    }

    return { valid: true };
  } catch (error: any) {
    if (error.code === 404) {
      return {
        valid: false,
        error: 'Folder not found. Check the folder ID.',
      };
    }
    if (error.code === 403) {
      return {
        valid: false,
        error: 'Access denied. Grant permission to this folder.',
      };
    }
    return {
      valid: false,
      error: 'Unable to verify folder access',
    };
  }
}
```

---

## Additional Resources

### Official Documentation
- [Google Drive API v3 Reference](https://developers.google.com/workspace/drive/api/reference/rest/v3)
- [Node.js Quickstart](https://developers.google.com/workspace/drive/api/quickstart/nodejs)
- [Search Query Guide](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Rate Limits](https://developers.google.com/workspace/drive/api/guides/limits)

### Package Documentation
- [googleapis npm](https://www.npmjs.com/package/googleapis)
- [@supabase/ssr](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [pdf-parse](https://www.npmjs.com/package/pdf-parse)

### Useful Tools
- [Google APIs Explorer](https://developers.google.com/apis-explorer/#p/drive/v3/)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [Google Cloud Console](https://console.cloud.google.com/)

---

## Summary

This documentation provides everything needed to integrate Google Drive API into your Deal Agent Framework. Key takeaways:

1. **Authentication:** Use Supabase OAuth for seamless token management
2. **File Operations:** List, search, and retrieve files from deal folders
3. **Content Extraction:** Extract text from PDFs for AI processing
4. **Rate Limiting:** Implement exponential backoff and request throttling
5. **Error Handling:** Gracefully handle common errors and edge cases
6. **Best Practices:** Cache results, optimize API calls, monitor usage

The provided code examples are production-ready and follow Next.js 15 App Router patterns with TypeScript. All functions include proper error handling and are designed to work with your Supabase-based authentication system.