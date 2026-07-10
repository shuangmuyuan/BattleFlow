import 'dotenv/config';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const seedSkillIds = [
  'market-insight',
  'competitor-analysis',
  'user-needs-breakdown',
];
const applyChanges = process.argv.includes('--apply');
const connectionString = process.env.BATTLEFLOW_DATABASE_URL;
const registryRoot = process.env.SKILL_REGISTRY_DIR || path.join(process.cwd(), 'data', 'skill-registry');
const registryIndexPath = path.join(registryRoot, 'index.json');

if (!connectionString) {
  throw new Error('BATTLEFLOW_DATABASE_URL is required');
}

const sslMode = process.env.BATTLEFLOW_DATABASE_SSL;
const ssl = sslMode && sslMode !== 'false' && sslMode !== 'disable'
  ? { rejectUnauthorized: process.env.BATTLEFLOW_DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' }
  : undefined;

const client = new Client({
  connectionString,
  ssl,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 120_000,
});

function isSeedSkillReference(value) {
  return typeof value === 'string' && seedSkillIds.includes(value);
}

async function readRegistryCleanupReport() {
  try {
    const parsed = JSON.parse(await fs.readFile(registryIndexPath, 'utf8'));
    const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
    const reviewRequests = Array.isArray(parsed.review_requests) ? parsed.review_requests : [];
    return {
      parsed,
      skills,
      reviewRequests,
      matchedSkillIds: skills
        .filter((skill) => isSeedSkillReference(skill?.id) || isSeedSkillReference(skill?.skill_id))
        .map((skill) => skill.id),
      matchedReviewRequestIds: reviewRequests
        .filter((request) => (
          isSeedSkillReference(request?.skill_id)
          || isSeedSkillReference(request?.source_skill_id)
          || isSeedSkillReference(request?.target_skill_id)
          || isSeedSkillReference(request?.submitted_skill?.id)
          || isSeedSkillReference(request?.submitted_skill?.skill_id)
        ))
        .map((request) => request.id),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        parsed: { skills: [], review_requests: [] },
        skills: [],
        reviewRequests: [],
        matchedSkillIds: [],
        matchedReviewRequestIds: [],
      };
    }
    throw error;
  }
}

async function cleanFileRegistry(report) {
  const matchedSkillIds = new Set(report.matchedSkillIds);
  const matchedReviewRequestIds = new Set(report.matchedReviewRequestIds);
  const nextIndex = {
    ...report.parsed,
    skills: report.skills.filter((skill) => !matchedSkillIds.has(skill?.id)),
    review_requests: report.reviewRequests.filter((request) => !matchedReviewRequestIds.has(request?.id)),
  };

  if (matchedSkillIds.size > 0 || matchedReviewRequestIds.size > 0) {
    await fs.mkdir(registryRoot, { recursive: true });
    const temporaryPath = `${registryIndexPath}.cleanup-${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(nextIndex, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, registryIndexPath);
  }

  await Promise.all(seedSkillIds.map((skillId) => (
    fs.rm(path.join(registryRoot, 'packages', skillId), { recursive: true, force: true })
  )));
}

try {
  await client.connect();
  const registryReport = await readRegistryCleanupReport();
  const [skillResult, workflowReferenceResult] = await Promise.all([
    client.query(
      `
        SELECT id, name, scope, status
        FROM skills
        WHERE id = ANY($1::varchar[])
        ORDER BY id
      `,
      [seedSkillIds],
    ),
    client.query(
      `
        SELECT id, workflow_id, name, skill_id
        FROM workflow_steps
        WHERE skill_id = ANY($1::varchar[])
        ORDER BY workflow_id, step_index
      `,
      [seedSkillIds],
    ),
  ]);

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    seedSkills: skillResult.rows,
    workflowReferences: workflowReferenceResult.rows,
    fileRegistrySkillIds: registryReport.matchedSkillIds,
    fileRegistryReviewRequestIds: registryReport.matchedReviewRequestIds,
  }, null, 2));

  if (!applyChanges) {
    console.log('Dry run completed. Re-run with --apply after reviewing the report.');
  } else {
    await client.query('BEGIN');
    try {
      const unbindResult = await client.query(
        `
          UPDATE workflow_steps
          SET skill_id = NULL
          WHERE skill_id = ANY($1::varchar[])
        `,
        [seedSkillIds],
      );
      await client.query(
        `
          DELETE FROM resource_access_grants
          WHERE resource_type = 'skill'
            AND resource_id = ANY($1::varchar[])
        `,
        [seedSkillIds],
      );
      const deleteResult = await client.query(
        'DELETE FROM skills WHERE id = ANY($1::varchar[]) RETURNING id',
        [seedSkillIds],
      );
      await client.query('COMMIT');
      await cleanFileRegistry(registryReport);
      console.log(`Unbound ${unbindResult.rowCount ?? 0} workflow step references while preserving the workflow rows.`);
      console.log(`Deleted ${deleteResult.rowCount ?? 0} official seed Skill records.`);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }
} finally {
  await client.end().catch(() => undefined);
}
