import { NextRequest, NextResponse } from 'next/server';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RECENT_LIST_LIMIT = 20;

function emptyStats() {
  return {
    skillCount: 0,
    workflowCount: 0,
    activeWorkflowCount: 0,
    knowledgeBaseCount: 0,
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

function toRecentWorkflow(workflow: WorkflowRecord) {
  return {
    id: workflow.id,
    workspaceId: workflow.workspaceId,
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
