import { z } from 'zod';

export const ToolMetadata = z.object({
  name: z.string(),
  appId: z.string(),
  description: z.string(),
  requiresCredential: z.boolean(),
  effectful: z.boolean(),
  idempotencyStrategy: z.enum(['none', 'client_generated', 'server_dedup']),
  undoStrategy: z.enum(['none', 'api_delete', 'api_update', 'manual']).optional(),
  rateLimit: z
    .object({
      maxCalls: z.number(),
      windowMs: z.number(),
    })
    .optional(),
  inputs: z.record(z.any()),
  outputs: z.record(z.any()),
});

export type ToolMetadata = z.infer<typeof ToolMetadata>;

export interface ToolRegistry {
  [toolName: string]: ToolMetadata;
}

export const TOOL_CATALOG: ToolRegistry = {
  x_post: {
    name: 'x_post',
    appId: 'x',
    description: 'Post a tweet on X (Twitter)',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'api_delete',
    rateLimit: {
      maxCalls: 50,
      windowMs: 900000, // 15 minutes
    },
    inputs: {
      text: { type: 'string', required: true, maxLength: 280 },
      media: { type: 'array', required: false },
    },
    outputs: {
      tweetId: { type: 'string' },
      url: { type: 'string' },
    },
  },
  x_reply: {
    name: 'x_reply',
    appId: 'x',
    description: 'Reply to a tweet on X',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'api_delete',
    inputs: {
      tweetId: { type: 'string', required: true },
      text: { type: 'string', required: true, maxLength: 280 },
    },
    outputs: {
      tweetId: { type: 'string' },
      url: { type: 'string' },
    },
  },
  linkedin_share: {
    name: 'linkedin_share',
    appId: 'linkedin',
    description: 'Share a post on LinkedIn',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'api_delete',
    rateLimit: {
      maxCalls: 100,
      windowMs: 86400000, // 24 hours
    },
    inputs: {
      text: { type: 'string', required: true, maxLength: 3000 },
      visibility: { type: 'string', required: false, enum: ['PUBLIC', 'CONNECTIONS'] },
      media: { type: 'array', required: false },
    },
    outputs: {
      postId: { type: 'string' },
      url: { type: 'string' },
    },
  },
  linkedin_comment: {
    name: 'linkedin_comment',
    appId: 'linkedin',
    description: 'Comment on a LinkedIn post',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'api_delete',
    inputs: {
      postId: { type: 'string', required: true },
      text: { type: 'string', required: true, maxLength: 1250 },
    },
    outputs: {
      commentId: { type: 'string' },
    },
  },
  slack_post: {
    name: 'slack_post',
    appId: 'slack',
    description: 'Post a message to a Slack channel',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'api_delete',
    inputs: {
      channel: { type: 'string', required: true },
      text: { type: 'string', required: true },
      blocks: { type: 'array', required: false },
    },
    outputs: {
      messageTs: { type: 'string' },
      channel: { type: 'string' },
    },
  },
  notion_page_create: {
    name: 'notion_page_create',
    appId: 'notion',
    description: 'Create a page in Notion',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'manual',
    inputs: {
      parent: { type: 'object', required: true },
      title: { type: 'string', required: true },
      content: { type: 'array', required: false },
    },
    outputs: {
      pageId: { type: 'string' },
      url: { type: 'string' },
    },
  },
  youtube_upload: {
    name: 'youtube_upload',
    appId: 'youtube',
    description: 'Upload a video to YouTube',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'api_delete',
    inputs: {
      title: { type: 'string', required: true },
      description: { type: 'string', required: false },
      videoFile: { type: 'string', required: true },
      privacyStatus: { type: 'string', required: false, enum: ['public', 'private', 'unlisted'] },
    },
    outputs: {
      videoId: { type: 'string' },
      url: { type: 'string' },
    },
  },
  tiktok_upload: {
    name: 'tiktok_upload',
    appId: 'tiktok',
    description: 'Upload a video to TikTok',
    requiresCredential: true,
    effectful: true,
    idempotencyStrategy: 'client_generated',
    undoStrategy: 'manual',
    inputs: {
      videoFile: { type: 'string', required: true },
      caption: { type: 'string', required: false, maxLength: 2200 },
      privacyLevel: { type: 'string', required: false, enum: ['PUBLIC', 'FRIENDS', 'SELF'] },
    },
    outputs: {
      videoId: { type: 'string' },
      shareUrl: { type: 'string' },
    },
  },
};

export function getToolMetadata(toolName: string): ToolMetadata | undefined {
  return TOOL_CATALOG[toolName];
}

export function getToolsByApp(appId: string): ToolMetadata[] {
  return Object.values(TOOL_CATALOG).filter((tool) => tool.appId === appId);
}

export function getAllTools(): ToolMetadata[] {
  return Object.values(TOOL_CATALOG);
}
