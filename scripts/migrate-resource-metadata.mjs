import { promises as fs } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const cwd = process.cwd();
const databaseUrl = process.env.BATTLEFLOW_DATABASE_URL;
const organizationId = process.env.BATTLEFLOW_MIGRATION_ORGANIZATION_ID
  || process.env.BATTLEFLOW_DEFAULT_ORGANIZATION_ID;
const userId = process.env.BATTLEFLOW_MIGRATION_USER_ID;
const skillRegistryDir = process.env.SKILL_REGISTRY_DIR || path.join(cwd, 'data', 'skill-registry');
const workflowRegistryDir = process.env.WORKFLOW_REGISTRY_DIR || path.join(cwd, 'data', 'workflows');

if (!databaseUrl) {
  throw new Error('BATTLEFLOW_DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

function skillDefinition(skill) {
  return {
    id: skill.id,
    skill_id: skill.skill_id || skill.id,
    display_name: skill.display_name || skill.name,
    name: skill.name || skill.display_name,
    description: skill.description || '',
    version: skill.version || '1.0.0',
    author: skill.author || 'BattleFlow',
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    methodology: skill.methodology || '',
    tools: Array.isArray(skill.tools) ? skill.tools : [],
    outputs: skill.outputs && typeof skill.outputs === 'object' ? skill.outputs : {},
    checklist: Array.isArray(skill.checklist) ? skill.checklist : [],
    acceptanceCriteria: Array.isArray(skill.acceptanceCriteria) ? skill.acceptanceCriteria : [],
    requiredSections: Array.isArray(skill.requiredSections) ? skill.requiredSections : [],
    evidenceRules: Array.isArray(skill.evidenceRules) ? skill.evidenceRules : [],
    failureConditions: Array.isArray(skill.failureConditions) ? skill.failureConditions : [],
    prompt_template: skill.prompt_template || '',
    skill_md: skill.skill_md || '',
    meta_json: skill.meta_json || {},
    review: skill.review || null,
    changelog: skill.changelog || '',
  };
}

function skillAssetManifest(skill) {
  return (skill.package_assets || []).map((asset) => ({
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

async function upsertGrant(client, input) {
  await client.query(
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

async function upsertSkill(client, skill, defaults) {
  const scope = skill.scope || defaults.scope || 'personal';
  const status = skill.status || defaults.status || 'imported';
  const activeOrganizationId = scope === 'official' ? null : organizationId;
  const ownerUserId = scope === 'official' ? null : userId;
  const definition = skillDefinition(skill);
  const assetManifest = skillAssetManifest(skill);

  if (scope !== 'official' && (!activeOrganizationId || !ownerUserId)) {
    throw new Error('BATTLEFLOW_MIGRATION_ORGANIZATION_ID and BATTLEFLOW_MIGRATION_USER_ID are required for non-official Skills');
  }

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
      activeOrganizationId,
      skill.display_name || skill.name || skill.id,
      skill.description || '',
      skill.version || '1.0.0',
      scope,
      status,
      ownerUserId,
      skill.source_type || defaults.source_type || 'local',
      skill.source_uri || null,
      JSON.stringify(assetManifest),
      JSON.stringify(definition),
      JSON.stringify(Array.isArray(skill.tags) ? skill.tags : []),
      skill.is_active !== false,
      ownerUserId,
      status === 'published' ? skill.updated_at || null : null,
      status === 'archived' ? skill.updated_at || null : null,
    ],
  );

  await client.query(
    `
      INSERT INTO skill_versions (skill_id, version, definition, asset_manifest, changelog_note, created_by, created_at)
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, now())
      ON CONFLICT (skill_id, version)
      DO UPDATE SET definition = EXCLUDED.definition, asset_manifest = EXCLUDED.asset_manifest, changelog_note = EXCLUDED.changelog_note
    `,
    [
      skill.id,
      skill.version || '1.0.0',
      JSON.stringify(definition),
      JSON.stringify(assetManifest),
      skill.changelog || null,
      ownerUserId,
    ],
  );

  if (activeOrganizationId && ownerUserId) {
    await upsertGrant(client, {
      organizationId: activeOrganizationId,
      resourceType: 'skill',
      resourceId: skill.id,
      subjectType: 'user',
      subjectId: ownerUserId,
      permission: 'admin',
      createdBy: ownerUserId,
    });
  }
}

function skillReviewDatabaseStatus(status) {
  return status === 'pending' ? 'pending_review' : status || 'pending_review';
}

async function upsertSkillReview(client, request) {
  if (!request?.submitted_skill) return;
  const versionResult = await client.query(
    `
      SELECT id
      FROM skill_versions
      WHERE skill_id = $1
        AND version = $2
      LIMIT 1
    `,
    [request.submitted_skill.id, request.submitted_skill.version || '1.0.0'],
  );
  const versionId = versionResult.rows[0]?.id || null;
  const status = skillReviewDatabaseStatus(request.status);

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
      JSON.stringify(request),
      request.is_active !== false,
      userId,
      request.reviewed_at ? userId : null,
      request.submitted_at || new Date().toISOString(),
      request.reviewed_at || null,
    ],
  );
}

async function loadOfficialSkills() {
  const registry = await readJson(path.join(cwd, 'skills', 'official', 'registry.json'), { skills: [] });
  const skills = [];
  for (const item of registry.skills || []) {
    const skillDir = path.join(cwd, 'skills', 'official', item.path);
    const meta = await readJson(path.join(skillDir, 'meta.json'), {});
    const skillMd = await readText(path.join(skillDir, 'skill.md'));
    skills.push({
      id: meta.id || item.path,
      skill_id: meta.id || item.path,
      display_name: meta.name || item.path,
      name: meta.name || item.path,
      description: meta.description || '',
      version: meta.version || '1.0.0',
      author: meta.author || 'BattleFlow',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      source_type: item.source_type || 'registry',
      scope: 'official',
      status: item.status || 'published',
      methodology: meta.definition?.methodology || '',
      tools: Array.isArray(meta.definition?.tools) ? meta.definition.tools : [],
      outputs: meta.definition?.outputs || {},
      checklist: Array.isArray(meta.definition?.checklist) ? meta.definition.checklist : [],
      prompt_template: meta.definition?.prompt_template || '',
      skill_md: skillMd,
      meta_json: meta,
      changelog: await readText(path.join(skillDir, 'CHANGELOG.md')),
      package_assets: [],
      is_active: true,
    });
  }
  return skills;
}

async function migrateSkills(client) {
  const index = await readJson(path.join(skillRegistryDir, 'index.json'), { skills: [], review_requests: [] });
  const officialSkills = await loadOfficialSkills();
  let count = 0;
  for (const skill of officialSkills) {
    await upsertSkill(client, skill, { scope: 'official', source_type: 'registry', status: 'published' });
    count += 1;
  }
  for (const skill of index.skills || []) {
    await upsertSkill(client, skill, {});
    count += 1;
  }
  for (const request of index.review_requests || []) {
    if (request.submitted_skill) {
      await upsertSkill(client, request.submitted_skill, { scope: 'team', status: 'pending_review' });
      await upsertSkillReview(client, request);
      count += 1;
    }
  }
  return count;
}

async function migrateWorkflows(client) {
  if (!organizationId || !userId) {
    throw new Error('BATTLEFLOW_MIGRATION_ORGANIZATION_ID and BATTLEFLOW_MIGRATION_USER_ID are required for workflows');
  }

  const store = await readJson(path.join(workflowRegistryDir, 'store.json'), { workspaces: [], workflows: [] });
  for (const workspace of store.workspaces || []) {
    await client.query(
      `
        INSERT INTO workflow_workspaces (id, organization_id, name, description, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (id)
        DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at
      `,
      [
        workspace.id,
        organizationId,
        workspace.name,
        workspace.description || '',
        userId,
        workspace.created_at || new Date().toISOString(),
        workspace.updated_at || new Date().toISOString(),
      ],
    );
  }

  for (const workflow of store.workflows || []) {
    await client.query(
      `
        INSERT INTO workflows (id, workspace_id, organization_id, name, description, status, state, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::timestamptz, $10::timestamptz)
        ON CONFLICT (id)
        DO UPDATE SET
          workspace_id = EXCLUDED.workspace_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          status = EXCLUDED.status,
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at
      `,
      [
        workflow.id,
        workflow.workspaceId || null,
        organizationId,
        workflow.name,
        workflow.description || '',
        workflow.status || 'draft',
        JSON.stringify(workflow),
        userId,
        workflow.created_at || new Date().toISOString(),
        workflow.updated_at || new Date().toISOString(),
      ],
    );
    await upsertGrant(client, {
      organizationId,
      resourceType: 'workflow',
      resourceId: workflow.id,
      subjectType: 'user',
      subjectId: userId,
      permission: 'admin',
      createdBy: userId,
    });

    for (const step of workflow.steps || []) {
      const skillResult = step.skill_id
        ? await client.query('SELECT id FROM skills WHERE id = $1 LIMIT 1', [step.skill_id])
        : { rows: [] };
      const skillId = skillResult.rows[0]?.id || null;
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
          step.step_index || 0,
          step.name || 'Workflow step',
          step.status || 'pending',
          step.output || null,
          JSON.stringify(workflow.stepChats?.[step.id] || []),
          step.completed_at || null,
          step.created_at || workflow.created_at || new Date().toISOString(),
          step.updated_at || workflow.updated_at || new Date().toISOString(),
        ],
      );
    }
  }
  return (store.workflows || []).length;
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const skillCount = await migrateSkills(client);
  const workflowCount = await migrateWorkflows(client);
  await client.query('COMMIT');
  console.log(`Migrated ${skillCount} Skill metadata records and ${workflowCount} workflow metadata records.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
