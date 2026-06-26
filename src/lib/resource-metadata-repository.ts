import type { PoolClient, QueryResultRow } from 'pg';
import { getPostgresPool, queryPostgres } from '../storage/database/postgres-client';
import { canAccess, requirePermission } from './auth/permissions';
import { ForbiddenError, type AuthOrganizationContext, type ResourcePermission, type ResourceSubjectType } from './auth/types';
import type { SkillRecord, SkillReviewRequest } from './skill-registry';
import type { WorkflowRecord, WorkspaceRecord } from './workflow-registry';

type BusinessResourceType = 'skill' | 'workflow' | 'workflow_workspace';

export interface ResourceMetadataRow extends QueryResultRow {
  resource_id: string;
  organization_id: string | null;
  owner_user_id: string | null;
  scope: string | null;
  status: string | null;
  resource_type: BusinessResourceType;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function skillDefinition(skill: SkillRecord): Record<string, unknown> {
  return {
    id: skill.id,
    skill_id: skill.skill_id,
    display_name: skill.display_name,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    author: skill.author,
    tags: skill.tags,
    methodology: skill.methodology,
    tools: skill.tools,
    outputs: skill.outputs,
    checklist: skill.checklist,
    acceptanceCriteria: skill.acceptanceCriteria,
    requiredSections: skill.requiredSections,
    evidenceRules: skill.evidenceRules,
    failureConditions: skill.failureConditions,
    prompt_template: skill.prompt_template,
    skill_md: skill.skill_md,
    meta_json: skill.meta_json,
    review: skill.review,
    attachments: skill.attachments,
    changelog: skill.changelog,
  };
}

function skillAssetManifest(skill: SkillRecord): Array<Record<string, unknown>> {
  return (skill.package_assets ?? []).map((asset) => ({
    path: asset.path,
    kind: asset.kind,
    source_folder: asset.source_folder,
    content_type: asset.mime_type,
    size_bytes: asset.size,
    content_kind: asset.content_kind,
    truncated: Boolean(asset.truncated),
    note: asset.note,
  }));
}

function skillReviewDatabaseStatus(status: SkillReviewRequest['status']): string {
  return status === 'pending' ? 'pending_review' : status;
}

function activeOrganizationId(context: AuthOrganizationContext): string {
  return context.activeOrganization.id;
}

function isOfficialReadableSkill(row: ResourceMetadataRow, action: string): boolean {
  return row.resource_type === 'skill'
    && row.scope === 'official'
    && (action.endsWith('.read') || action.endsWith('.list') || action.endsWith('.run'));
}

export function canAccessBusinessResource(
  context: AuthOrganizationContext,
  action: string,
  row: ResourceMetadataRow,
): boolean {
  if (isOfficialReadableSkill(row, action)) {
    return true;
  }

  return canAccess(context, action, {
    organizationId: row.organization_id ?? activeOrganizationId(context),
    resourceType: row.resource_type === 'workflow_workspace' ? 'workflow' : row.resource_type,
    resourceId: row.resource_id,
    ownerUserId: row.owner_user_id,
  });
}

async function upsertResourceGrant(input: {
  client: PoolClient;
  organizationId: string;
  resourceType: 'skill' | 'workflow';
  resourceId: string;
  subjectType: ResourceSubjectType;
  subjectId: string;
  permission: ResourcePermission;
  createdBy: string;
}): Promise<void> {
  await input.client.query(
    `
      INSERT INTO resource_access_grants (
        organization_id,
        resource_type,
        resource_id,
        subject_type,
        subject_id,
        permission,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      ON CONFLICT (organization_id, resource_type, resource_id, subject_type, subject_id, permission)
      DO UPDATE SET updated_at = now()
    `,
    [
      input.organizationId,
      input.resourceType,
      input.resourceId,
      input.subjectType,
      input.subjectId,
      input.permission,
      input.createdBy,
    ],
  );
}

async function upsertSkillAssetRows(client: PoolClient, skill: SkillRecord): Promise<void> {
  await client.query('DELETE FROM skill_assets WHERE skill_id = $1', [skill.id]);

  for (const asset of skill.package_assets ?? []) {
    await client.query(
      `
        INSERT INTO skill_assets (skill_id, path, content_type, size_bytes, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
      `,
      [
        skill.id,
        asset.path,
        asset.mime_type,
        asset.size,
        toJson({
          kind: asset.kind,
          source_folder: asset.source_folder,
          content_kind: asset.content_kind,
          truncated: Boolean(asset.truncated),
          note: asset.note,
        }),
      ],
    );
  }
}

export async function upsertSkillBusinessMetadata(
  context: AuthOrganizationContext,
  skill: SkillRecord,
): Promise<void> {
  const organizationId = skill.scope === 'official' ? null : activeOrganizationId(context);
  const ownerUserId = skill.scope === 'official' ? null : context.user.id;
  const definition = skillDefinition(skill);
  const assetManifest = skillAssetManifest(skill);
  const client = await getPostgresPool().connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO skills (
          id,
          organization_id,
          name,
          description,
          version,
          scope,
          status,
          owner_user_id,
          source_type,
          source_uri,
          asset_manifest,
          definition,
          tags,
          is_active,
          created_by,
          updated_at,
          published_at,
          archived_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, now(), $16, $17)
        ON CONFLICT (id)
        DO UPDATE SET
          organization_id = COALESCE(skills.organization_id, EXCLUDED.organization_id),
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          version = EXCLUDED.version,
          scope = EXCLUDED.scope,
          status = EXCLUDED.status,
          owner_user_id = COALESCE(skills.owner_user_id, EXCLUDED.owner_user_id),
          source_type = EXCLUDED.source_type,
          source_uri = EXCLUDED.source_uri,
          asset_manifest = EXCLUDED.asset_manifest,
          definition = EXCLUDED.definition,
          tags = EXCLUDED.tags,
          is_active = EXCLUDED.is_active,
          updated_at = now(),
          published_at = EXCLUDED.published_at,
          archived_at = EXCLUDED.archived_at
      `,
      [
        skill.id,
        organizationId,
        skill.display_name || skill.name || skill.id,
        skill.description,
        skill.version,
        skill.scope,
        skill.status,
        ownerUserId,
        skill.source_type,
        skill.source_uri ?? null,
        toJson(assetManifest),
        toJson(definition),
        toJson(skill.tags ?? []),
        skill.is_active,
        context.user.id,
        skill.status === 'published' ? skill.updated_at : null,
        skill.status === 'archived' ? skill.updated_at : null,
      ],
    );

    await client.query(
      `
        INSERT INTO skill_versions (skill_id, version, definition, asset_manifest, changelog_note, created_by, created_at)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, now())
        ON CONFLICT (skill_id, version)
        DO UPDATE SET
          definition = EXCLUDED.definition,
          asset_manifest = EXCLUDED.asset_manifest,
          changelog_note = EXCLUDED.changelog_note
      `,
      [
        skill.id,
        skill.version,
        toJson(definition),
        toJson(assetManifest),
        skill.changelog || null,
        context.user.id,
      ],
    );

    await upsertSkillAssetRows(client, skill);

    if (organizationId) {
      await upsertResourceGrant({
        client,
        organizationId,
        resourceType: 'skill',
        resourceId: skill.id,
        subjectType: 'user',
        subjectId: context.user.id,
        permission: 'admin',
        createdBy: context.user.id,
      });

      if (skill.scope === 'team' && skill.status === 'published') {
        await upsertResourceGrant({
          client,
          organizationId,
          resourceType: 'skill',
          resourceId: skill.id,
          subjectType: 'organization',
          subjectId: organizationId,
          permission: 'read',
          createdBy: context.user.id,
        });
        await upsertResourceGrant({
          client,
          organizationId,
          resourceType: 'skill',
          resourceId: skill.id,
          subjectType: 'organization',
          subjectId: organizationId,
          permission: 'run',
          createdBy: context.user.id,
        });
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertSkillsBusinessMetadata(
  context: AuthOrganizationContext,
  skills: SkillRecord[],
): Promise<void> {
  for (const skill of skills) {
    await upsertSkillBusinessMetadata(context, skill);
  }
}

export async function upsertSkillReviewBusinessMetadata(
  context: AuthOrganizationContext,
  request: SkillReviewRequest,
): Promise<void> {
  const client = await getPostgresPool().connect();
  const status = skillReviewDatabaseStatus(request.status);

  try {
    await client.query('BEGIN');
    const versionId = (await client.query<{ id: string }>(
      `
        SELECT id
        FROM skill_versions
        WHERE skill_id = $1
          AND version = $2
        LIMIT 1
      `,
      [request.submitted_skill.id, request.submitted_skill.version],
    )).rows[0]?.id ?? null;

    await client.query(
      `
        INSERT INTO skill_reviews (
          id,
          skill_id,
          version_id,
          status,
          note,
          payload,
          is_active,
          requested_by,
          reviewed_by,
          requested_at,
          reviewed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::timestamptz, $11::timestamptz)
        ON CONFLICT (id)
        DO UPDATE SET
          skill_id = EXCLUDED.skill_id,
          version_id = EXCLUDED.version_id,
          status = EXCLUDED.status,
          note = EXCLUDED.note,
          payload = EXCLUDED.payload,
          is_active = EXCLUDED.is_active,
          reviewed_by = EXCLUDED.reviewed_by,
          reviewed_at = EXCLUDED.reviewed_at
      `,
      [
        request.id,
        request.submitted_skill.id,
        versionId,
        status,
        request.review_note || request.submitted_note || null,
        toJson(request),
        request.is_active,
        context.user.id,
        request.reviewed_at ? context.user.id : null,
        request.submitted_at,
        request.reviewed_at ?? null,
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markSkillReviewBusinessDecision(
  context: AuthOrganizationContext,
  reviewId: string,
  decision: 'approved' | 'rejected',
  reviewNote = '',
): Promise<void> {
  const now = new Date().toISOString();
  await queryPostgres(
    `
      UPDATE skill_reviews
      SET
        status = $2,
        note = COALESCE(NULLIF($3, ''), note),
        reviewed_by = $4,
        reviewed_at = $5::timestamptz,
        is_active = false,
        payload = payload || $6::jsonb
      WHERE id = $1
    `,
    [
      reviewId,
      decision,
      reviewNote.trim(),
      context.user.id,
      now,
      toJson({
        status: decision,
        decision,
        review_note: reviewNote.trim() || undefined,
        reviewed_at: now,
        is_active: false,
      }),
    ],
  );
}

async function fetchSkillRows(ids: string[]): Promise<Map<string, ResourceMetadataRow>> {
  if (ids.length === 0) return new Map();
  const result = await queryPostgres<ResourceMetadataRow>(
    `
      SELECT
        id AS resource_id,
        organization_id,
        owner_user_id,
        scope,
        status,
        'skill'::varchar AS resource_type
      FROM skills
      WHERE id = ANY($1::varchar[])
        AND is_active = true
    `,
    [[...new Set(ids)]],
  );
  return new Map(result.rows.map((row) => [row.resource_id, row]));
}

export async function filterAuthorizedSkills(
  context: AuthOrganizationContext,
  skills: SkillRecord[],
  action = 'skill.read',
): Promise<SkillRecord[]> {
  await upsertSkillsBusinessMetadata(context, skills.filter((skill) => skill.scope === 'official'));
  const rows = await fetchSkillRows(skills.map((skill) => skill.id));
  return skills.filter((skill) => {
    const row = rows.get(skill.id);
    return row ? canAccessBusinessResource(context, action, row) : false;
  });
}

export async function requireSkillRecordAccess(
  context: AuthOrganizationContext,
  skill: SkillRecord,
  action: string,
): Promise<void> {
  if (skill.scope === 'official') {
    await upsertSkillBusinessMetadata(context, skill);
  }
  const row = (await fetchSkillRows([skill.id])).get(skill.id);
  if (!row || !canAccessBusinessResource(context, action, row)) {
    throw new ForbiddenError();
  }
}

export async function requireSkillIdAccess(
  context: AuthOrganizationContext,
  skillId: string,
  action: string,
): Promise<void> {
  const row = (await fetchSkillRows([skillId])).get(skillId);
  if (!row || !canAccessBusinessResource(context, action, row)) {
    throw new ForbiddenError();
  }
}

export async function upsertWorkspaceBusinessMetadata(
  context: AuthOrganizationContext,
  workspace: WorkspaceRecord,
): Promise<void> {
  await queryPostgres(
    `
      INSERT INTO workflow_workspaces (id, organization_id, name, description, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
      ON CONFLICT (id)
      DO UPDATE SET
        organization_id = workflow_workspaces.organization_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        updated_at = EXCLUDED.updated_at
    `,
    [
      workspace.id,
      activeOrganizationId(context),
      workspace.name,
      workspace.description,
      context.user.id,
      workspace.created_at,
      workspace.updated_at,
    ],
  );
}

export async function upsertWorkflowBusinessMetadata(
  context: AuthOrganizationContext,
  workflow: WorkflowRecord,
): Promise<void> {
  const client = await getPostgresPool().connect();
  const organizationId = activeOrganizationId(context);

  try {
    await client.query('BEGIN');
    await client.query(
      `
        INSERT INTO workflows (
          id,
          workspace_id,
          organization_id,
          name,
          description,
          status,
          current_step_index,
          state,
          created_by,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::timestamptz, $11::timestamptz)
        ON CONFLICT (id)
        DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          organization_id = workflows.organization_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          current_step_index = EXCLUDED.current_step_index,
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at
      `,
      [
        workflow.id,
        workflow.workspaceId || null,
        organizationId,
        workflow.name,
        workflow.description,
        workflow.status,
        workflow.steps.find((step) => step.status === 'in_progress')?.step_index ?? 0,
        toJson(workflow),
        context.user.id,
        workflow.created_at,
        workflow.updated_at,
      ],
    );

    for (const step of workflow.steps) {
      const skillId = step.skill_id
        ? (await client.query<{ id: string }>('SELECT id FROM skills WHERE id = $1 LIMIT 1', [step.skill_id])).rows[0]?.id ?? null
        : null;

      await client.query(
        `
          INSERT INTO workflow_steps (
            id,
            workflow_id,
            skill_id,
            step_index,
            name,
            status,
            output,
            conversation,
            completed_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10::timestamptz, $11::timestamptz)
          ON CONFLICT (id)
          DO UPDATE SET
            skill_id = EXCLUDED.skill_id,
            step_index = EXCLUDED.step_index,
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            output = EXCLUDED.output,
            conversation = EXCLUDED.conversation,
            completed_at = EXCLUDED.completed_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          step.id,
          workflow.id,
          skillId,
          step.step_index,
          step.name,
          step.status,
          step.output,
          toJson(workflow.stepChats?.[step.id] ?? []),
          step.completed_at ?? null,
          step.created_at ?? workflow.created_at,
          step.updated_at ?? workflow.updated_at,
        ],
      );
    }

    await client.query('DELETE FROM workflow_assets WHERE workflow_id = $1', [workflow.id]);
    for (const file of workflow.contextFiles ?? []) {
      await client.query(
        `
          INSERT INTO workflow_assets (workflow_id, asset_type, path, content_type, size_bytes, metadata, created_by, created_at)
          VALUES ($1, 'context_file', $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
        `,
        [
          workflow.id,
          file.name,
          file.type,
          file.size,
          toJson({ id: file.id, stepId: file.stepId, contentKind: file.contentKind, note: file.note }),
          context.user.id,
          file.created_at,
        ],
      );
    }

    for (const file of workflow.reviewedOutputFiles ?? []) {
      await client.query(
        `
          INSERT INTO workflow_assets (workflow_id, asset_type, path, content_type, size_bytes, metadata, created_by, created_at)
          VALUES ($1, 'reviewed_output', $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
        `,
        [
          workflow.id,
          file.name,
          file.type,
          file.size,
          toJson({ id: file.id, stepId: file.stepId, contentKind: file.contentKind, note: file.note }),
          context.user.id,
          file.created_at,
        ],
      );
    }

    await upsertResourceGrant({
      client,
      organizationId,
      resourceType: 'workflow',
      resourceId: workflow.id,
      subjectType: 'user',
      subjectId: context.user.id,
      permission: 'admin',
      createdBy: context.user.id,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteWorkflowBusinessMetadata(workflowId: string): Promise<void> {
  await queryPostgres(
    `
      DELETE FROM resource_access_grants
      WHERE resource_type = 'workflow'
        AND resource_id = $1
    `,
    [workflowId],
  );
  await queryPostgres('DELETE FROM workflows WHERE id = $1', [workflowId]);
}

export async function deleteWorkspaceBusinessMetadata(workspaceId: string): Promise<void> {
  const result = await queryPostgres<{ id: string }>(
    'SELECT id FROM workflows WHERE workspace_id = $1',
    [workspaceId],
  );
  const workflowIds = result.rows.map((row) => row.id);
  if (workflowIds.length > 0) {
    await queryPostgres(
      `
        DELETE FROM resource_access_grants
        WHERE resource_type = 'workflow'
          AND resource_id = ANY($1::varchar[])
      `,
      [workflowIds],
    );
  }
  await queryPostgres('DELETE FROM workflows WHERE workspace_id = $1', [workspaceId]);
  await queryPostgres('DELETE FROM workflow_workspaces WHERE id = $1', [workspaceId]);
}

export async function upsertWorkflowStateBusinessMetadata(
  context: AuthOrganizationContext,
  state: { workspaces: WorkspaceRecord[]; workflows: WorkflowRecord[] },
): Promise<void> {
  for (const workspace of state.workspaces) {
    await upsertWorkspaceBusinessMetadata(context, workspace);
  }
  for (const workflow of state.workflows) {
    await upsertWorkflowBusinessMetadata(context, workflow);
  }
}

async function fetchWorkspaceRows(ids: string[]): Promise<Map<string, ResourceMetadataRow>> {
  if (ids.length === 0) return new Map();
  const result = await queryPostgres<ResourceMetadataRow>(
    `
      SELECT
        id AS resource_id,
        organization_id,
        created_by AS owner_user_id,
        null::varchar AS scope,
        null::varchar AS status,
        'workflow_workspace'::varchar AS resource_type
      FROM workflow_workspaces
      WHERE id = ANY($1::varchar[])
    `,
    [[...new Set(ids)]],
  );
  return new Map(result.rows.map((row) => [row.resource_id, row]));
}

export async function filterAuthorizedWorkspaces(
  context: AuthOrganizationContext,
  workspaces: WorkspaceRecord[],
  action = 'workflow.read',
): Promise<WorkspaceRecord[]> {
  const rows = await fetchWorkspaceRows(workspaces.map((workspace) => workspace.id));
  return workspaces.filter((workspace) => {
    const row = rows.get(workspace.id);
    return row ? canAccessBusinessResource(context, action, row) : false;
  });
}

export async function requireWorkspaceAccess(
  context: AuthOrganizationContext,
  workspaceId: string,
  action: string,
): Promise<void> {
  const row = (await fetchWorkspaceRows([workspaceId])).get(workspaceId);
  if (!row || !canAccessBusinessResource(context, action, row)) {
    throw new ForbiddenError();
  }
}

async function fetchWorkflowRows(ids: string[]): Promise<Map<string, ResourceMetadataRow>> {
  if (ids.length === 0) return new Map();
  const result = await queryPostgres<ResourceMetadataRow>(
    `
      SELECT
        id AS resource_id,
        organization_id,
        created_by AS owner_user_id,
        null::varchar AS scope,
        status,
        'workflow'::varchar AS resource_type
      FROM workflows
      WHERE id = ANY($1::varchar[])
    `,
    [[...new Set(ids)]],
  );
  return new Map(result.rows.map((row) => [row.resource_id, row]));
}

export async function filterAuthorizedWorkflows(
  context: AuthOrganizationContext,
  workflows: WorkflowRecord[],
  action = 'workflow.read',
): Promise<WorkflowRecord[]> {
  const rows = await fetchWorkflowRows(workflows.map((workflow) => workflow.id));
  return workflows.filter((workflow) => {
    const row = rows.get(workflow.id);
    return row ? canAccessBusinessResource(context, action, row) : false;
  });
}

export async function requireWorkflowAccess(
  context: AuthOrganizationContext,
  workflowId: string,
  action: string,
): Promise<void> {
  const row = (await fetchWorkflowRows([workflowId])).get(workflowId);
  if (!row || !canAccessBusinessResource(context, action, row)) {
    throw new ForbiddenError();
  }
}

export function requireOwnedCreatePermission(context: AuthOrganizationContext, action: string): void {
  requirePermission(context, action, {
    organizationId: activeOrganizationId(context),
    ownerUserId: context.user.id,
  });
}
