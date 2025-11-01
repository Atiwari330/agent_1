# Gmail API Documentation for Next.js/Vercel Integration
## Updated: October 2025

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites & Setup](#prerequisites--setup)
3. [OAuth 2.0 Authentication Flow](#oauth-20-authentication-flow)
4. [Gmail API Scopes](#gmail-api-scopes)
5. [Reading Email Threads](#reading-email-threads)
6. [Searching Messages by Contact](#searching-messages-by-contact)
7. [Composing Drafts](#composing-drafts)
8. [Code Examples for Next.js](#code-examples-for-nextjs)
9. [Best Practices & Error Handling](#best-practices--error-handling)

---

## Overview

The Gmail API allows applications to access Gmail mailboxes and manage email data including threads, messages, labels, and drafts. For Next.js applications deployed on Vercel, the official `googleapis` Node.js client library provides the most reliable integration path.

**Key Capabilities:**
- Read emails and threads
- Search messages with advanced queries
- Create and manage drafts
- Send emails
- Manage labels and filters
- Access message metadata

**Official Library:**
```bash
npm install googleapis@105
```

---

## Prerequisites & Setup

### 1. Google Cloud Project Setup

**Enable Gmail API:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Navigate to "APIs & Services" > "Library"
4. Search for "Gmail API" and enable it

### 2. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" for public apps or "Internal" for workspace-only
3. Fill in required fields:
   - **App name**: Your application name
   - **User support email**: Your support email
   - **Developer contact information**: Your email
4. Add scopes (see [Gmail API Scopes](#gmail-api-scopes) section)
5. Add test users during development

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application"
4. Configure:
   - **Authorized JavaScript origins**: 
     - `http://localhost:3000` (development)
     - `https://yourdomain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://yourdomain.com/api/auth/callback/google`
5. Download the credentials JSON file
6. Store `client_id` and `client_secret` in environment variables

### 4. Environment Variables (.env.local)

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# For Vercel deployment
# NEXTAUTH_URL will be automatically set
```

---

## OAuth 2.0 Authentication Flow

### Next.js with NextAuth.js (Recommended)

**Installation:**
```bash
npm install next-auth googleapis
```

**File: `app/api/auth/[...nextauth]/route.ts`**

```typescript
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send',
          ].join(' '),
          // Request offline access for refresh tokens
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
```

### Manual OAuth Flow (Alternative)

**File: `lib/gmail-auth.ts`**

```typescript
import { google } from 'googleapis';

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL + '/api/auth/callback/google'
  );
}

export function getAuthUrl(oauth2Client: any) {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
  ];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

export async function getTokenFromCode(oauth2Client: any, code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}
```

### Refresh Token Handling

```typescript
async function refreshAccessToken(refreshToken: string) {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
}
```

---

## Gmail API Scopes

Choose the minimum required scopes for your application. The Gmail API uses hierarchical scopes where some scopes include permissions from others.

### Complete Scope Reference

| Scope | Description | Sensitivity Level | Use Case |
|-------|-------------|-------------------|----------|
| `https://www.googleapis.com/auth/gmail.readonly` | Read all resources and metadata (no write) | **Restricted** | Reading emails, viewing threads |
| `https://www.googleapis.com/auth/gmail.compose` | Create, read, update, delete drafts; Send messages | **Restricted** | Full email composition workflow |
| `https://www.googleapis.com/auth/gmail.send` | Send messages only (no read/modify) | **Sensitive** | Send-only applications |
| `https://www.googleapis.com/auth/gmail.modify` | All read/write except permanent deletion | **Restricted** | Label management, archiving |
| `https://www.googleapis.com/auth/gmail.metadata` | Read metadata only (no body/attachments) | **Restricted** | Email indexing, analytics |
| `https://www.googleapis.com/auth/gmail.labels` | Manage labels only | **Non-sensitive** | Label organization |
| `https://www.googleapis.com/auth/gmail.insert` | Insert/import messages only | **Restricted** | Message migration |
| `https://mail.google.com/` | Full access including permanent deletion | **Restricted** | Admin-level operations |

### Recommended Scopes for Your Deal Agent

For your deal management application, you'll need:

```typescript
const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',    // Read email threads
  'https://www.googleapis.com/auth/gmail.compose',     // Create drafts and send
];
```

---

## Reading Email Threads

### Initialize Gmail Client

```typescript
import { google } from 'googleapis';

function getGmailClient(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  return google.gmail({ version: 'v1', auth: oauth2Client });
}
```

### List Messages

```typescript
async function listMessages(
  accessToken: string,
  options: {
    maxResults?: number;
    query?: string;
    labelIds?: string[];
  } = {}
) {
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: options.maxResults || 10,
      q: options.query,
      labelIds: options.labelIds,
    });
    
    return response.data.messages || [];
  } catch (error) {
    console.error('Error listing messages:', error);
    throw error;
  }
}
```

### Get Single Message Details

```typescript
async function getMessage(accessToken: string, messageId: string) {
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full', // Options: 'minimal', 'full', 'raw', 'metadata'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting message:', error);
    throw error;
  }
}
```

### Parse Message Body

```typescript
function parseMessageBody(message: any): string {
  const payload = message.payload;
  let body = '';
  
  // Handle multipart messages
  if (payload.parts) {
    const part = payload.parts.find(
      (p: any) => p.mimeType === 'text/plain' || p.mimeType === 'text/html'
    );
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  } 
  // Handle simple messages
  else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  
  return body;
}
```

### Get Message Headers

```typescript
function getMessageHeaders(message: any): Record<string, string> {
  const headers: Record<string, string> = {};
  
  message.payload?.headers?.forEach((header: any) => {
    headers[header.name.toLowerCase()] = header.value;
  });
  
  return headers;
}

// Usage example
const headers = getMessageHeaders(message);
console.log('From:', headers['from']);
console.log('Subject:', headers['subject']);
console.log('Date:', headers['date']);
```

### Get Thread Conversations

```typescript
async function getThread(accessToken: string, threadId: string) {
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting thread:', error);
    throw error;
  }
}
```

---

## Searching Messages by Contact

### Search Query Syntax

The Gmail API uses the same query syntax as the Gmail web interface.

**Common Search Operators:**

| Operator | Description | Example |
|----------|-------------|---------|
| `from:` | Sender email | `from:john@example.com` |
| `to:` | Recipient email | `to:jane@example.com` |
| `subject:` | Subject line | `subject:invoice` |
| `label:` | Has label | `label:important` |
| `is:` | Message state | `is:unread`, `is:starred` |
| `has:` | Has attachment | `has:attachment` |
| `after:` | Date after | `after:2025/01/01` |
| `before:` | Date before | `before:2025/12/31` |
| `newer_than:` | Relative time | `newer_than:2d` (2 days) |
| `older_than:` | Relative time | `older_than:1w` (1 week) |

### Search by Contact Email

```typescript
async function searchMessagesByContact(
  accessToken: string,
  contactEmail: string,
  options: {
    maxResults?: number;
    includeSpamTrash?: boolean;
  } = {}
) {
  const gmail = getGmailClient(accessToken);
  
  // Search for messages from OR to the contact
  const query = `from:${contactEmail} OR to:${contactEmail}`;
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: options.maxResults || 50,
      includeSpamTrash: options.includeSpamTrash || false,
    });
    
    return response.data.messages || [];
  } catch (error) {
    console.error('Error searching messages:', error);
    throw error;
  }
}
```

### Advanced Search with Multiple Criteria

```typescript
async function searchMessagesAdvanced(
  accessToken: string,
  searchParams: {
    from?: string;
    to?: string;
    subject?: string;
    hasAttachment?: boolean;
    isUnread?: boolean;
    newerThan?: string; // e.g., '7d' for 7 days
  }
) {
  const queryParts: string[] = [];
  
  if (searchParams.from) queryParts.push(`from:${searchParams.from}`);
  if (searchParams.to) queryParts.push(`to:${searchParams.to}`);
  if (searchParams.subject) queryParts.push(`subject:${searchParams.subject}`);
  if (searchParams.hasAttachment) queryParts.push('has:attachment');
  if (searchParams.isUnread) queryParts.push('is:unread');
  if (searchParams.newerThan) queryParts.push(`newer_than:${searchParams.newerThan}`);
  
  const query = queryParts.join(' ');
  
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
    });
    
    return response.data.messages || [];
  } catch (error) {
    console.error('Error in advanced search:', error);
    throw error;
  }
}
```

### Get Latest Message from Contact

```typescript
async function getLatestMessageFromContact(
  accessToken: string,
  contactEmail: string
) {
  const messages = await searchMessagesByContact(accessToken, contactEmail, {
    maxResults: 1
  });
  
  if (messages.length === 0) {
    return null;
  }
  
  return await getMessage(accessToken, messages[0].id!);
}
```

### Check for Unanswered Emails

```typescript
async function getUnansweredEmailsFromContact(
  accessToken: string,
  contactEmail: string
) {
  const gmail = getGmailClient(accessToken);
  
  // Search for emails from contact that are unread OR in inbox (not replied)
  const query = `from:${contactEmail} (is:unread OR in:inbox)`;
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
    });
    
    const messages = response.data.messages || [];
    
    // Fetch full message details
    const fullMessages = await Promise.all(
      messages.map(msg => getMessage(accessToken, msg.id!))
    );
    
    return fullMessages;
  } catch (error) {
    console.error('Error checking unanswered emails:', error);
    throw error;
  }
}
```

---

## Composing Drafts

### Create Draft Email

```typescript
async function createDraft(
  accessToken: string,
  draftData: {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
  }
) {
  const gmail = getGmailClient(accessToken);
  
  // Create the email content
  const rawMessage = createRawMessage(draftData);
  
  try {
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: rawMessage,
        },
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error creating draft:', error);
    throw error;
  }
}
```

### Create Raw Message (RFC 2822 Format)

```typescript
function createRawMessage(messageData: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  from?: string;
}): string {
  const messageParts = [
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    `To: ${messageData.to}`,
  ];
  
  if (messageData.cc) {
    messageParts.push(`Cc: ${messageData.cc}`);
  }
  
  if (messageData.bcc) {
    messageParts.push(`Bcc: ${messageData.bcc}`);
  }
  
  if (messageData.from) {
    messageParts.push(`From: ${messageData.from}`);
  }
  
  messageParts.push(`Subject: ${messageData.subject}`);
  messageParts.push('');
  messageParts.push(messageData.body);
  
  const message = messageParts.join('\n');
  
  // Base64url encode the message
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
```

### Create Draft Reply

```typescript
async function createDraftReply(
  accessToken: string,
  originalMessageId: string,
  replyBody: string
) {
  const gmail = getGmailClient(accessToken);
  
  // Get original message to extract headers
  const originalMessage = await getMessage(accessToken, originalMessageId);
  const headers = getMessageHeaders(originalMessage);
  
  const threadId = originalMessage.threadId;
  
  // Create reply message
  const messageParts = [
    `Content-Type: text/html; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    `To: ${headers['from']}`,
    `Subject: Re: ${headers['subject']?.replace(/^Re: /i, '')}`,
    `In-Reply-To: ${headers['message-id']}`,
    `References: ${headers['references'] || headers['message-id']}`,
    '',
    replyBody,
  ];
  
  const rawMessage = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  try {
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: rawMessage,
          threadId: threadId,
        },
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error creating draft reply:', error);
    throw error;
  }
}
```

### List Drafts

```typescript
async function listDrafts(accessToken: string, maxResults: number = 10) {
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.drafts.list({
      userId: 'me',
      maxResults: maxResults,
    });
    
    return response.data.drafts || [];
  } catch (error) {
    console.error('Error listing drafts:', error);
    throw error;
  }
}
```

### Get Draft Details

```typescript
async function getDraft(accessToken: string, draftId: string) {
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.drafts.get({
      userId: 'me',
      id: draftId,
      format: 'full',
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting draft:', error);
    throw error;
  }
}
```

### Update Draft

```typescript
async function updateDraft(
  accessToken: string,
  draftId: string,
  updatedData: {
    to: string;
    subject: string;
    body: string;
  }
) {
  const gmail = getGmailClient(accessToken);
  
  const rawMessage = createRawMessage(updatedData);
  
  try {
    const response = await gmail.users.drafts.update({
      userId: 'me',
      id: draftId,
      requestBody: {
        message: {
          raw: rawMessage,
        },
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error updating draft:', error);
    throw error;
  }
}
```

### Send Draft

```typescript
async function sendDraft(accessToken: string, draftId: string) {
  const gmail = getGmailClient(accessToken);
  
  try {
    const response = await gmail.users.drafts.send({
      userId: 'me',
      requestBody: {
        id: draftId,
      },
    });
    
    return response.data;
  } catch (error) {
    console.error('Error sending draft:', error);
    throw error;
  }
}
```

### Delete Draft

```typescript
async function deleteDraft(accessToken: string, draftId: string) {
  const gmail = getGmailClient(accessToken);
  
  try {
    await gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting draft:', error);
    throw error;
  }
}
```

---

## Code Examples for Next.js

### API Route for Email Operations

**File: `app/api/gmail/messages/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const searchParams = request.nextUrl.searchParams;
  const contactEmail = searchParams.get('contact');
  const maxResults = parseInt(searchParams.get('maxResults') || '10');
  
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    const query = contactEmail 
      ? `from:${contactEmail} OR to:${contactEmail}`
      : undefined;
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults,
    });
    
    // Fetch full message details
    const messages = await Promise.all(
      (response.data.messages || []).map(async (msg) => {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        });
        return fullMessage.data;
      })
    );
    
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Gmail API Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
```

### API Route for Creating Drafts

**File: `app/api/gmail/drafts/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { to, subject, body, cc, bcc } = await request.json();
  
  if (!to || !subject || !body) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }
  
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: session.accessToken });
    
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Create raw message
    const messageParts = [
      `Content-Type: text/html; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      `To: ${to}`,
    ];
    
    if (cc) messageParts.push(`Cc: ${cc}`);
    if (bcc) messageParts.push(`Bcc: ${bcc}`);
    
    messageParts.push(`Subject: ${subject}`);
    messageParts.push('');
    messageParts.push(body);
    
    const rawMessage = Buffer.from(messageParts.join('\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const response = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: rawMessage,
        },
      },
    });
    
    return NextResponse.json({ draft: response.data });
  } catch (error) {
    console.error('Gmail API Error:', error);
    return NextResponse.json(
      { error: 'Failed to create draft' },
      { status: 500 }
    );
  }
}
```

### Server Action Example

**File: `app/actions/gmail.ts`**

```typescript
'use server';

import { getServerSession } from 'next-auth';
import { google } from 'googleapis';

export async function getEmailsByContact(contactEmail: string) {
  const session = await getServerSession();
  
  if (!session?.accessToken) {
    throw new Error('Not authenticated');
  }
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: session.accessToken });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const query = `from:${contactEmail} OR to:${contactEmail}`;
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  });
  
  return response.data.messages || [];
}

export async function createEmailDraft(draftData: {
  to: string;
  subject: string;
  body: string;
}) {
  const session = await getServerSession();
  
  if (!session?.accessToken) {
    throw new Error('Not authenticated');
  }
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: session.accessToken });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const messageParts = [
    `Content-Type: text/html; charset="UTF-8"`,
    `To: ${draftData.to}`,
    `Subject: ${draftData.subject}`,
    '',
    draftData.body,
  ];
  
  const rawMessage = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: { raw: rawMessage },
    },
  });
  
  return response.data;
}
```

---

## Best Practices & Error Handling

### 1. Rate Limiting

The Gmail API has usage quotas. For standard projects:
- **250 quota units per user per second**
- **10,000 quota units per day per user**

Most operations cost 5-50 units. Batch requests when possible.

```typescript
// Implement exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.code === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### 2. Error Handling

```typescript
async function safeGmailOperation<T>(
  operation: () => Promise<T>
): Promise<{ data?: T; error?: string }> {
  try {
    const data = await operation();
    return { data };
  } catch (error: any) {
    console.error('Gmail API Error:', error);
    
    if (error.code === 401) {
      return { error: 'Authentication expired. Please re-authenticate.' };
    } else if (error.code === 403) {
      return { error: 'Insufficient permissions. Check OAuth scopes.' };
    } else if (error.code === 404) {
      return { error: 'Resource not found.' };
    } else if (error.code === 429) {
      return { error: 'Rate limit exceeded. Please try again later.' };
    }
    
    return { error: 'An unexpected error occurred.' };
  }
}
```

### 3. Token Refresh Strategy

```typescript
// Middleware to check and refresh tokens
async function withFreshToken(
  session: any,
  operation: (accessToken: string) => Promise<any>
) {
  let accessToken = session.accessToken;
  
  // Check if token is expired (expires_at is in seconds)
  const now = Math.floor(Date.now() / 1000);
  const isExpired = session.expiresAt && session.expiresAt < now;
  
  if (isExpired && session.refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: session.refreshToken,
    });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    accessToken = credentials.access_token!;
    
    // Update session with new token
    // (Implementation depends on your session management)
  }
  
  return await operation(accessToken);
}
```

### 4. Batch Requests

For fetching multiple messages, use batch requests to reduce API calls:

```typescript
async function batchGetMessages(
  accessToken: string,
  messageIds: string[]
) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  // Fetch in batches of 10 to avoid overwhelming the API
  const batchSize = 10;
  const results = [];
  
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(id => gmail.users.messages.get({
        userId: 'me',
        id: id,
        format: 'full',
      }))
    );
    results.push(...batchResults.map(r => r.data));
  }
  
  return results;
}
```

### 5. Message Parsing Best Practices

```typescript
// Safely extract email addresses from headers
function extractEmail(headerValue: string): string {
  const match = headerValue.match(/<(.+?)>/);
  return match ? match[1] : headerValue.trim();
}

// Parse date to JavaScript Date object
function parseEmailDate(dateString: string): Date {
  return new Date(dateString);
}

// Clean HTML content for preview
function getPlainTextPreview(htmlBody: string, maxLength: number = 200): string {
  // Remove HTML tags
  const text = htmlBody.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return text.length > maxLength 
    ? text.substring(0, maxLength) + '...'
    : text;
}
```

### 6. Security Considerations

```typescript
// Never log or expose access tokens
// ❌ BAD
console.log('Access token:', session.accessToken);

// ✅ GOOD
console.log('User authenticated:', !!session.accessToken);

// Store tokens securely in environment variables or secure session storage
// Use HTTPS in production
// Implement CSRF protection
// Regularly rotate OAuth client secrets
```

### 7. Testing in Development

```typescript
// Mock Gmail API for testing
const mockGmailClient = {
  users: {
    messages: {
      list: jest.fn().mockResolvedValue({
        data: { messages: [{ id: '123', threadId: 'thread1' }] }
      }),
      get: jest.fn().mockResolvedValue({
        data: { id: '123', payload: { /* ... */ } }
      }),
    },
    drafts: {
      create: jest.fn().mockResolvedValue({
        data: { id: 'draft123' }
      }),
    },
  },
};
```

---

## Additional Resources

- **Official Documentation**: https://developers.google.com/gmail/api
- **Node.js Client Library**: https://github.com/googleapis/google-api-nodejs-client
- **API Reference**: https://developers.google.com/gmail/api/reference/rest
- **OAuth 2.0**: https://developers.google.com/identity/protocols/oauth2
- **NextAuth.js Gmail Integration**: https://next-auth.js.org/providers/google
- **Gmail API Quotas**: https://developers.google.com/gmail/api/reference/quota

---

## Summary for Your Deal Agent Framework

For your deal management system, you'll need to:

1. **Authentication**: Use NextAuth.js with Google Provider
2. **Required Scopes**: 
   - `gmail.readonly` - to read email threads
   - `gmail.compose` - to create drafts and send emails
3. **Key Functions**:
   - Search messages by deal contact email
   - Retrieve latest email thread
   - Identify unanswered emails
   - Create follow-up email drafts
4. **Integration Points**:
   - Store contact emails in Supabase Deal Object
   - Link threads to HubSpot Deal ID
   - Generate AI-powered draft responses using Vercel AI SDK

**Recommended Architecture:**
```
Next.js API Routes → Gmail API Client → Supabase (cache/metadata)
                                     ↓
                              Vercel AI SDK (for draft generation)
```

This documentation provides everything needed to implement Gmail integration for your Deal Agent Framework.