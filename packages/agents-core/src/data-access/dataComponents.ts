import { and, count, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DatabaseClient } from '../db/client';
import { agentDataComponents, dataComponents } from '../db/schema';
import type {
  DataComponentInsert,
  DataComponentSelect,
  DataComponentUpdate,
  PaginationConfig,
  ProjectScopeConfig,
} from '../types/index';

/**
 * Get a data component by ID
 */
export const getDataComponent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    dataComponentId: string;
  }): Promise<DataComponentSelect | null> => {
    const result = await db.query.dataComponents.findFirst({
      where: and(
        eq(dataComponents.tenantId, params.scopes.tenantId),
        eq(dataComponents.projectId, params.scopes.projectId),
        eq(dataComponents.id, params.dataComponentId)
      ),
    });

    return result || null;
  };

/**
 * List all data components for a tenant/project
 */
export const listDataComponents =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<DataComponentSelect[]> => {
    return await db
      .select()
      .from(dataComponents)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId)
        )
      )
      .orderBy(desc(dataComponents.createdAt));
  };

/**
 * List data components with pagination
 */
export const listDataComponentsPaginated =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    pagination?: PaginationConfig;
  }): Promise<{
    data: DataComponentSelect[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }> => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(dataComponents)
        .where(
          and(
            eq(dataComponents.tenantId, params.scopes.tenantId),
            eq(dataComponents.projectId, params.scopes.projectId)
          )
        )
        .limit(limit)
        .offset(offset)
        .orderBy(desc(dataComponents.createdAt)),
      db
        .select({ count: count() })
        .from(dataComponents)
        .where(
          and(
            eq(dataComponents.tenantId, params.scopes.tenantId),
            eq(dataComponents.projectId, params.scopes.projectId)
          )
        ),
    ]);

    const total =
      typeof totalResult[0]?.count === 'string'
        ? parseInt(totalResult[0].count, 10)
        : totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

/**
 * Create a new data component
 */
export const createDataComponent =
  (db: DatabaseClient) =>
  async (params: DataComponentInsert): Promise<DataComponentSelect> => {
    const dataComponent = await db.insert(dataComponents).values(params).returning();

    return dataComponent[0];
  };

/**
 * Update a data component
 */
export const updateDataComponent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    dataComponentId: string;
    data: DataComponentUpdate;
  }): Promise<DataComponentSelect | null> => {
    const now = new Date().toISOString();

    await db
      .update(dataComponents)
      .set({
        ...params.data,
        updatedAt: now,
      })
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId),
          eq(dataComponents.id, params.dataComponentId)
        )
      );

    return await getDataComponent(db)({
      scopes: params.scopes,
      dataComponentId: params.dataComponentId,
    });
  };

/**
 * Delete a data component
 */
export const deleteDataComponent =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; dataComponentId: string }): Promise<boolean> => {
    const result = await db
      .delete(dataComponents)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId),
          eq(dataComponents.id, params.dataComponentId)
        )
      )
      .returning();

    return result.length > 0;
  };

/**
 * Get data components for a specific agent
 */
export const getDataComponentsForAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
  }): Promise<DataComponentSelect[]> => {
    return await db
      .select({
        id: dataComponents.id,
        tenantId: dataComponents.tenantId,
        projectId: dataComponents.projectId,
        name: dataComponents.name,
        description: dataComponents.description,
        props: dataComponents.props,
        createdAt: dataComponents.createdAt,
        updatedAt: dataComponents.updatedAt,
      })
      .from(dataComponents)
      .innerJoin(agentDataComponents, eq(dataComponents.id, agentDataComponents.dataComponentId))
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId),
          eq(agentDataComponents.agentId, params.agentId)
        )
      )
      .orderBy(desc(dataComponents.createdAt));
  };

/**
 * Associate a data component with an agent
 */
export const associateDataComponentWithAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    graphId: string;
    agentId: string;
    dataComponentId: string;
  }) => {
    const association = await db
      .insert(agentDataComponents)
      .values({
        id: nanoid(),
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        graphId: params.graphId,
        agentId: params.agentId,
        dataComponentId: params.dataComponentId,
      })
      .returning();

    return association[0];
  };

/**
 * Remove association between data component and agent
 */
export const removeDataComponentFromAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
    dataComponentId: string;
  }): Promise<boolean> => {
    const result = await db
      .delete(agentDataComponents)
      .where(
        and(
          eq(agentDataComponents.tenantId, params.scopes.tenantId),
          eq(agentDataComponents.projectId, params.scopes.projectId),
          eq(agentDataComponents.agentId, params.agentId),
          eq(agentDataComponents.dataComponentId, params.dataComponentId)
        )
      )
      .returning();

    return result.length > 0;
  };

export const deleteAgentDataComponentRelationByAgent =
  (db: DatabaseClient) => async (params: { scopes: ProjectScopeConfig; agentId: string }) => {
    const result = await db
      .delete(agentDataComponents)
      .where(
        and(
          eq(agentDataComponents.tenantId, params.scopes.tenantId),
          eq(agentDataComponents.agentId, params.agentId)
        )
      );
    return (result.rowsAffected || 0) > 0;
  };

/**
 * Get all agents that use a specific data component
 */
export const getAgentsUsingDataComponent =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; dataComponentId: string }) => {
    return await db
      .select({
        agentId: agentDataComponents.agentId,
        createdAt: agentDataComponents.createdAt,
      })
      .from(agentDataComponents)
      .where(
        and(
          eq(agentDataComponents.tenantId, params.scopes.tenantId),
          eq(agentDataComponents.projectId, params.scopes.projectId),
          eq(agentDataComponents.dataComponentId, params.dataComponentId)
        )
      )
      .orderBy(desc(agentDataComponents.createdAt));
  };

/**
 * Check if a data component is associated with an agent
 */
export const isDataComponentAssociatedWithAgent =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    agentId: string;
    dataComponentId: string;
  }): Promise<boolean> => {
    const result = await db
      .select({ id: agentDataComponents.id })
      .from(agentDataComponents)
      .where(
        and(
          eq(agentDataComponents.tenantId, params.scopes.tenantId),
          eq(agentDataComponents.projectId, params.scopes.projectId),
          eq(agentDataComponents.agentId, params.agentId),
          eq(agentDataComponents.dataComponentId, params.dataComponentId)
        )
      )
      .limit(1);

    return result.length > 0;
  };

/**
 * Upsert agent-data component relation (create if it doesn't exist, no-op if it does)
 */
export const upsertAgentDataComponentRelation =
  (db: DatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    graphId: string;
    agentId: string;
    dataComponentId: string;
  }) => {
    // Check if relation already exists
    const exists = await isDataComponentAssociatedWithAgent(db)(params);

    if (!exists) {
      // Create the relation if it doesn't exist
      return await associateDataComponentWithAgent(db)(params);
    }

    // If it exists, we could optionally return the existing relation
    // For now, just return success indication
    return null;
  };

/**
 * Count data components for a tenant/project
 */
export const countDataComponents =
  (db: DatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig }): Promise<number> => {
    const result = await db
      .select({ count: count() })
      .from(dataComponents)
      .where(
        and(
          eq(dataComponents.tenantId, params.scopes.tenantId),
          eq(dataComponents.projectId, params.scopes.projectId)
        )
      );

    const countValue = result[0]?.count;
    return typeof countValue === 'string' ? parseInt(countValue, 10) : countValue || 0;
  };

/**
 * Upsert a data component (create if it doesn't exist, update if it does)
 */
export const upsertDataComponent =
  (db: DatabaseClient) =>
  async (params: { data: DataComponentInsert }): Promise<DataComponentSelect | null> => {
    const scopes = { tenantId: params.data.tenantId, projectId: params.data.projectId };

    const existing = await getDataComponent(db)({
      scopes,
      dataComponentId: params.data.id,
    });

    if (existing) {
      // Update existing data component
      return await updateDataComponent(db)({
        scopes,
        dataComponentId: params.data.id,
        data: {
          name: params.data.name,
          description: params.data.description,
          props: params.data.props,
        },
      });
    } else {
      // Create new data component
      return await createDataComponent(db)(params.data);
    }
  };
