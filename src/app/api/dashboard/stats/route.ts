import { NextRequest, NextResponse } from 'next/server';
import type { QueryResultRow } from 'pg';
import { canAccess, requireOrganizationContext } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import {
  isKnowledgeDatabaseConfigured,
  listKnowledgeBases,
  type KnowledgeBaseRecord,
} from '@/lib/knowledge-repository';
import {
  filterAuthorizedSkills,
  filterAuthorizedWorkflows,
  filterAuthorizedWorkspaces,
} from '@/lib/resource-metadata-repository';
import { listSkills } from '@/lib/skill-registry';
import { getWorkflowState, type WorkflowRecord } from '@/lib/workflow-registry';
import { hasPostgresDatabaseConfig, queryPostgres } from '@/storage/database/postgres-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CountRow extends QueryResultRow {
  count: string | number;
}

const RECENT_LIST_LIMIT = 5;

function emptyStats() {
  return {
    skillCount: 0,
    workflowCount: 0,
    activeWorkflowCount: 0,
    knowledgeBaseCount: 0,
    completedPrdCount: 0,
    recentWorkflows: [],
    recentSkills: [],
  };
}

function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function byUpdatedAtDesc<T extends { updated_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

function canReadKnowledgeBase(
  context: Awaited<ReturnType<typeof requireOrganizationContext>>,
  knowledgeBase: KnowledgeBaseRecord,
): boolean {
  if (knowledgeBase.organization_id !== context.activeOrganization.id) {
    return false;
  }

  return canAccess(context, 'knowledge_base.read', {
    organizationId: knowledgeBase.organization_id,
    resourceType: 'knowledge_base',
    resourceId: knowledgeBase.id,
    ownerUserId: knowledgeBase.created_by,
  });
}

async function listReadableKnowledgeBases(
  context: Awaited<ReturnType<typeof requireOrganizationContext>>,
): Promise<KnowledgeBaseRecord[]> {
  if (!isKnowledgeDatabaseConfigured()) {
    return [];
  }

  try {
    return (await listKnowledgeBases()).filter((knowledgeBase) => (
      canReadKnowledgeBase(context, knowledgeBase)
    ));
  } catch (error) {
    console.error('Dashboard knowledge count failed:', error);
    return [];
  }
}

async function countReadablePrdDocuments(
  organizationId: string,
  workflowIds: string[],
): Promise<number> {
  if (!hasPostgresDatabaseConfig() || workflowIds.length === 0) {
    return 0;
  }

  try {
    const uniqueWorkflowIds = [...new Set(workflowIds)];
    const result = await queryPostgres<CountRow>(
      `
        SELECT count(*)::int AS count
        FROM prd_documents
        WHERE organization_id = $1
          AND workflow_id = ANY($2::varchar[])
      `,
      [organizationId, uniqueWorkflowIds],
    );
    const rawCount = result.rows[0]?.count;
    const count = typeof rawCount === 'number' ? rawCount : Number.parseInt(rawCount || '0', 10);
    return Number.isFinite(count) ? count : 0;
  } catch (error) {
    console.error('Dashboard PRD count failed:', error);
    return 0;
  }
}

function toRecentWorkflow(workflow: WorkflowRecord) {
  return {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    updated_at: workflow.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const [allSkills, workflowState, knowledgeBases] = await Promise.all([
      listSkills(),
      getWorkflowState(),
      listReadableKnowledgeBases(context),
    ]);

    const [skills, workflows, authorizedWorkspaces] = await Promise.all([
      filterAuthorizedSkills(context, allSkills, 'skill.read'),
      filterAuthorizedWorkflows(context, workflowState.workflows, 'workflow.read'),
      filterAuthorizedWorkspaces(context, workflowState.workspaces, 'workflow.read'),
    ]);
    const visibleWorkspaceIds = new Set([
      ...authorizedWorkspaces.map((workspace) => workspace.id),
      ...workflows.map((workflow) => workflow.workspaceId),
    ]);
    const visibleWorkflows = workflows.filter((workflow) => visibleWorkspaceIds.has(workflow.workspaceId));
    const recentWorkflows = byUpdatedAtDesc(visibleWorkflows).slice(0, RECENT_LIST_LIMIT).map(toRecentWorkflow);
    const recentSkills = byUpdatedAtDesc(skills).slice(0, RECENT_LIST_LIMIT).map((skill) => ({
      id: skill.id,
      name: skill.name,
      scope: skill.scope,
      version: skill.version,
    }));

    return jsonOk({
      skillCount: skills.length,
      workflowCount: visibleWorkflows.length,
      activeWorkflowCount: visibleWorkflows.filter((workflow) => workflow.status === 'in_progress').length,
      knowledgeBaseCount: knowledgeBases.length,
      completedPrdCount: await countReadablePrdDocuments(
        context.activeOrganization.id,
        visibleWorkflows.map((workflow) => workflow.id),
      ),
      recentWorkflows,
      recentSkills,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    if (error instanceof AuthError) {
      return jsonOk({ ...emptyStats(), error: error.message }, error.status);
    }
    return jsonOk(emptyStats());
  }
}
