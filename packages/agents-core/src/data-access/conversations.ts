import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { conversations, messages } from '../db/schema';
import type {
  ConversationHistoryConfig,
  ConversationInsert,
  ConversationSelect,
  ConversationUpdate,
  MessageContent,
  PaginationConfig,
  ProjectScopeConfig,
} from '../types/index';

export const listConversations =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    userId?: string;
    pagination?: PaginationConfig;
  }): Promise<{ conversations: ConversationSelect[]; total: number }> => {
    const { userId, pagination } = params;

    const page = pagination?.page || 1;
    const limit = Math.min(pagination?.limit || 20, 200);
    const offset = (page - 1) * limit;

    const whereConditions = [
      eq(conversations.tenantId, params.scopes.tenantId),
      eq(conversations.projectId, params.scopes.projectId),
    ];

    if (userId) {
      whereConditions.push(eq(conversations.userId, userId));
    }

    const conversationList = await db
      .select()
      .from(conversations)
      .where(and(...whereConditions))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalResult = await db
      .select({ count: count() })
      .from(conversations)
      .where(and(...whereConditions));

    const total = totalResult[0]?.count || 0;

    return {
      conversations: conversationList,
      total: typeof total === 'string' ? Number.parseInt(total, 10) : (total as number),
    };
  };

export const createConversation = (db: DatabaseClient) => async (params: ConversationInsert) => {
  const now = new Date().toISOString();

  const [created] = await db
    .insert(conversations)
    .values({
      ...params,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
};

export const updateConversation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    data: ConversationUpdate;
  }) => {
    const now = new Date().toISOString();

    const [updated] = await db
      .update(conversations)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(conversations.tenantId, params.scopes.tenantId),
          eq(conversations.projectId, params.scopes.projectId),
          eq(conversations.id, params.conversationId)
        )
      )
      .returning();

    return updated;
  };

export const deleteConversation =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }): Promise<boolean> => {
    try {
      // Delete messages first (due to foreign key constraints)
      await db
        .delete(messages)
        .where(
          and(
            eq(messages.tenantId, params.scopes.tenantId),
            eq(messages.projectId, params.scopes.projectId),
            eq(messages.conversationId, params.conversationId)
          )
        );

      // Delete conversation
      await db
        .delete(conversations)
        .where(
          and(
            eq(conversations.tenantId, params.scopes.tenantId),
            eq(conversations.projectId, params.scopes.projectId),
            eq(conversations.id, params.conversationId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  };

export const updateConversationActiveAgent =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string; activeAgentId: string }) => {
    return updateConversation(db)({
      scopes: params.scopes,
      conversationId: params.conversationId,
      data: {
        activeAgentId: params.activeAgentId,
      },
    });
  };

//simpler getConversation
export const getConversation =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    return await db.query.conversations.findFirst({
      where: and(
        eq(conversations.tenantId, params.scopes.tenantId),
        eq(conversations.projectId, params.scopes.projectId),
        eq(conversations.id, params.conversationId)
      ),
    });
  };

// Create or get existing conversation
export const createOrGetConversation =
  (db: DatabaseClient) => async (input: ConversationInsert) => {
    const conversationId = input.id || nanoid();

    // Check if conversation already exists
    if (input.id) {
      const existing = await db.query.conversations.findFirst({
        where: and(eq(conversations.tenantId, input.tenantId), eq(conversations.id, input.id)),
      });

      if (existing) {
        // Update active agent if different
        if (existing.activeAgentId !== input.activeAgentId) {
          await db
            .update(conversations)
            .set({
              activeAgentId: input.activeAgentId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(conversations.id, input.id));

          return { ...existing, activeAgentId: input.activeAgentId };
        }
        return existing;
      }
    }

    // Create new conversation
    const newConversation = {
      id: conversationId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      userId: input.userId,
      activeAgentId: input.activeAgentId,
      title: input.title,
      lastContextResolution: input.lastContextResolution,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.insert(conversations).values(newConversation);
    return newConversation;
  };

/**
 * Extract text content from message content object
 */
function extractMessageText(content: MessageContent): string {
  if (content.text) {
    return content.text;
  }

  if (content.parts) {
    return content.parts
      .filter((part) => part.kind === 'text' && part.text)
      .map((part) => part.text)
      .join(' ');
  }

  return '';
}

/**
 * Apply context window management by truncating or summarizing old messages
 */
function applyContextWindowManagement(messageHistory: any[], maxTokens: number): any[] {
  // Simple token estimation: ~4 characters per token
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  let totalTokens = 0;
  const managedHistory = [];

  // Process messages from most recent backwards
  for (let i = messageHistory.length - 1; i >= 0; i--) {
    const message = messageHistory[i];
    const messageText = extractMessageText(message.content);
    const messageTokens = estimateTokens(messageText);

    if (totalTokens + messageTokens <= maxTokens) {
      managedHistory.unshift(message);
      totalTokens += messageTokens;
    } else {
      // Add a summary message for truncated history if there are more messages
      if (i > 0) {
        const summaryMessage = {
          id: `summary-${nanoid()}`,
          role: 'system',
          content: {
            text: `[Previous conversation history truncated - ${i + 1} earlier messages]`,
          },
          visibility: 'system',
          messageType: 'chat',
          createdAt: messageHistory[0].createdAt,
        };
        managedHistory.unshift(summaryMessage);
      }
      break;
    }
  }

  return managedHistory;
}

/**
 * Get conversation history with filtering and context management
 */
export const getConversationHistory =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    options?: ConversationHistoryConfig;
  }): Promise<any[]> => {
    const { scopes, conversationId, options = {} } = params;
    const { tenantId, projectId } = scopes;

    const {
      limit = options.limit ?? 50,
      includeInternal = options.includeInternal ?? false,
      maxOutputTokens,
    } = options;

    const whereConditions = [
      eq(messages.tenantId, tenantId),
      eq(messages.projectId, projectId),
      eq(messages.conversationId, conversationId),
    ];

    // Filter by visibility unless explicitly including internal messages
    if (!includeInternal) {
      whereConditions.push(eq(messages.visibility, 'user-facing'));
    }

    const messageHistory = await db
      .select()
      .from(messages)
      .where(and(...whereConditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Reverse to get chronological order (oldest first)
    const chronologicalHistory = messageHistory.reverse();

    // Apply context window management if maxOutputTokens is specified
    if (maxOutputTokens) {
      return applyContextWindowManagement(chronologicalHistory, maxOutputTokens);
    }

    return chronologicalHistory;
  };

/**
 * Get active agent for a conversation
 */
export const getActiveAgentForConversation =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; conversationId: string }) => {
    return await db.query.conversations.findFirst({
      where: and(
        eq(conversations.tenantId, params.scopes.tenantId),
        eq(conversations.projectId, params.scopes.projectId),
        eq(conversations.id, params.conversationId)
      ),
    });
  };

/**
 * Set active agent for a conversation (upsert operation)
 */
export const setActiveAgentForConversation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    conversationId: string;
    agentId: string;
  }): Promise<void> => {
    await db
      .insert(conversations)
      .values({
        id: params.conversationId,
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        activeAgentId: params.agentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [conversations.tenantId, conversations.projectId, conversations.id],
        set: {
          activeAgentId: params.agentId,
          updatedAt: new Date().toISOString(),
        },
      });
  };

export const setActiveAgentForThread =
  (db: DatabaseClient) =>
  async ({
    scopes,
    threadId,
    agentId,
  }: {
    scopes: ProjectScopeConfig;
    threadId: string;
    agentId: string;
  }) => {
    return setActiveAgentForConversation(db)({ scopes, conversationId: threadId, agentId });
  };
