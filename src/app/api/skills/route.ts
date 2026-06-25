import { NextRequest, NextResponse } from 'next/server';
import { canAccess, requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import { AuthError } from '@/lib/auth/types';
import {
  filterAuthorizedSkills,
  requireOwnedCreatePermission,
  requireSkillIdAccess,
  requireSkillRecordAccess,
  upsertSkillBusinessMetadata,
} from '@/lib/resource-metadata-repository';
import {
  archiveSkill,
  approveSkillReview,
  createWorkflowSkillReview,
  getSkill,
  importSkillFromGit,
  importSkillFromPath,
  importSkillFromUpload,
  listSkillReviewRequests,
  listSkills,
  rejectSkillReview,
  renderSkillMarkdown,
  requestSkillReview,
  SkillImportValidationError,
  type SkillRecord,
  type SkillReviewRequest,
  rollbackSkill,
  type SkillScope,
  type SkillVersionBump,
} from '@/lib/skill-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonError(message: string, status = 500) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}

function jsonOk(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function getScope(value: unknown): SkillScope {
  return value === 'team' || value === 'official' || value === 'personal' ? value : 'personal';
}

function importStatusForScope(scope: SkillScope) {
  return scope === 'team' ? 'pending_review' : 'imported';
}

function getVersionBump(value: unknown): SkillVersionBump {
  return value === 'minor' || value === 'major' || value === 'patch' ? value : 'patch';
}

function getChangelogNote(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isReviewRequest(value: unknown): value is SkillReviewRequest {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'operation' in value
    && 'target_scope' in value
    && 'submitted_skill' in value,
  );
}

function importResponse(items: unknown[]) {
  return {
    skills: items.filter((item) => !isReviewRequest(item)),
    review_requests: items.filter(isReviewRequest),
  };
}

async function persistSkillItems(
  context: Awaited<ReturnType<typeof requireOrganizationContext>>,
  items: Array<SkillRecord | SkillReviewRequest>,
) {
  await Promise.all(items.map(async (item) => {
    if (isReviewRequest(item)) {
      await upsertSkillBusinessMetadata(context, item.submitted_skill);
      return;
    }

    await upsertSkillBusinessMetadata(context, item);
  }));
}

async function requireSkillAccessBeforeAssetRead(
  context: Awaited<ReturnType<typeof requireOrganizationContext>>,
  id: string,
  action: string,
): Promise<void> {
  try {
    await requireSkillIdAccess(context, id, action);
  } catch (error) {
    if (!(error instanceof AuthError) || error.status !== 403) {
      throw error;
    }

    const skill = await getSkill(id);
    if (!skill) {
      throw error;
    }
    await requireSkillRecordAccess(context, skill, action);
  }
}

// GET /api/skills - list, detail, or markdown download
export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope') || undefined;
    const status = searchParams.get('status') || undefined;
    const downloadVersion = searchParams.get('downloadVersion') || undefined;
    const inline = searchParams.get('inline') === '1';

    if (id && downloadVersion !== undefined) {
      await requireSkillAccessBeforeAssetRead(context, id, 'skill.read');
      const skill = await getSkill(id);
      if (!skill) return jsonError('Skill not found', 404);
      const markdown = await renderSkillMarkdown(id, downloadVersion || undefined);
      if (!markdown) return jsonError('Skill not found', 404);
      return new NextResponse(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${id}-${downloadVersion || 'current'}.md"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (id) {
      await requireSkillAccessBeforeAssetRead(context, id, 'skill.read');
      const skill = await getSkill(id);
      if (!skill) return jsonError('Skill not found', 404);
      return jsonOk({ skill });
    }

    const [allSkills, allReviewRequests] = await Promise.all([
      listSkills({ scope, status }),
      listSkillReviewRequests(),
    ]);
    const skills = await filterAuthorizedSkills(context, allSkills, 'skill.read');
    const reviewRequests = canAccess(context, 'skill.review.manage', {
      organizationId: context.activeOrganization.id,
    }) ? allReviewRequests : [];
    return jsonOk({ skills, review_requests: reviewRequests });
  } catch (error) {
    console.error('Skills GET error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to fetch skills');
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      requireOwnedCreatePermission(context, 'skill.import');
      const formData = await request.formData();
      const action = String(formData.get('action') || 'import_upload');
      if (action !== 'import_upload') return jsonError(`Unsupported multipart action: ${action}`, 400);

      const file = formData.get('file');
      if (!(file instanceof File)) return jsonError('A zip file is required', 400);

      const scope = getScope(formData.get('scope'));
      const versionBump = getVersionBump(formData.get('version_bump'));
      const changelogNote = getChangelogNote(formData.get('changelog_note'));
      const skills = await importSkillFromUpload(file, {
        scope,
        sourceType: 'local',
        status: importStatusForScope(scope),
        versionBump,
        changelogNote,
      });
      await persistSkillItems(context, skills);
      return jsonOk(importResponse(skills));
    }

    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'import_path') {
      requireOwnedCreatePermission(context, 'skill.import');
      const inputPath = String(body.path || '').trim();
      if (!inputPath) return jsonError('path is required', 400);
      const scope = getScope(body.scope);
      const versionBump = getVersionBump(body.version_bump);
      const changelogNote = getChangelogNote(body.changelog_note);
      const skills = await importSkillFromPath(inputPath, {
        scope,
        sourceType: 'local',
        sourceUri: inputPath,
        status: importStatusForScope(scope),
        versionBump,
        changelogNote,
      });
      await persistSkillItems(context, skills);
      return jsonOk(importResponse(skills));
    }

    if (action === 'import_git') {
      requireOwnedCreatePermission(context, 'skill.import');
      const url = String(body.url || '').trim();
      if (!url) return jsonError('url is required', 400);
      const scope = getScope(body.scope);
      const versionBump = getVersionBump(body.version_bump);
      const changelogNote = getChangelogNote(body.changelog_note);
      const skills = await importSkillFromGit(url, {
        scope,
        sourceType: 'git',
        sourceUri: url,
        status: importStatusForScope(scope),
        versionBump,
        changelogNote,
      });
      await persistSkillItems(context, skills);
      return jsonOk(importResponse(skills));
    }

    if (action === 'import_registry') {
      return jsonError('Remote registry import API is reserved for a later integration', 501);
    }

    if (action === 'publish_request') {
      const id = String(body.id || '').trim();
      if (!id) return jsonError('id is required', 400);
      await requireSkillAccessBeforeAssetRead(context, id, 'skill.publish');
      const sourceSkill = await getSkill(id);
      if (!sourceSkill) return jsonError('Skill not found', 404);
      const note = String(body.note || '').trim();
      const reviewRequest = await requestSkillReview(id, note);
      await persistSkillItems(context, [reviewRequest]);
      return jsonOk({ review_request: reviewRequest, skill: reviewRequest.submitted_skill });
    }

    if (action === 'submit_workflow_draft') {
      requireOwnedCreatePermission(context, 'skill.create');
      const draft = body.draft && typeof body.draft === 'object' ? body.draft : null;
      if (!draft) return jsonError('draft is required', 400);
      const reviewRequest = await createWorkflowSkillReview({
        workflowId: String(draft.workflowId || '').trim(),
        workflowName: String(draft.workflowName || '').trim(),
        stepId: String(draft.stepId || '').trim(),
        stepName: String(draft.stepName || '').trim(),
        draftId: String(draft.id || draft.draftId || '').trim(),
        baseSkillId: String(draft.baseSkillId || '').trim(),
        baseSkillVersion: typeof draft.baseSkillVersion === 'string' ? draft.baseSkillVersion : undefined,
        name: String(draft.name || '').trim(),
        description: String(draft.description || '').trim(),
        methodology: String(draft.methodology || ''),
        tools: Array.isArray(draft.tools) ? draft.tools.filter((item: unknown): item is string => typeof item === 'string') : [],
        outputs: draft.outputs && typeof draft.outputs === 'object' && !Array.isArray(draft.outputs) ? draft.outputs : {},
        checklist: Array.isArray(draft.checklist) ? draft.checklist.filter((item: unknown): item is string => typeof item === 'string') : [],
        tags: Array.isArray(draft.tags) ? draft.tags.filter((item: unknown): item is string => typeof item === 'string') : [],
        prompt_template: typeof draft.prompt_template === 'string' ? draft.prompt_template : undefined,
        skill_md: typeof draft.skill_md === 'string' ? draft.skill_md : undefined,
        tuning_request: typeof draft.tuning_request === 'string' ? draft.tuning_request : undefined,
        change_summary: typeof draft.change_summary === 'string' ? draft.change_summary : undefined,
        validation_note: typeof draft.validation_note === 'string' ? draft.validation_note : undefined,
        note: typeof body.note === 'string' ? body.note : undefined,
      });
      await persistSkillItems(context, [reviewRequest]);
      return jsonOk({ review_request: reviewRequest, skill: reviewRequest.submitted_skill });
    }

    if (action === 'approve_publish') {
      requirePermission(context, 'skill.review.manage', { organizationId: context.activeOrganization.id });
      const id = String(body.id || '').trim();
      if (!id) return jsonError('id is required', 400);
      const note = String(body.note || '').trim();
      const skill = await approveSkillReview(id, note);
      if (!isReviewRequest(skill)) await persistSkillItems(context, [skill]);
      return jsonOk(isReviewRequest(skill) ? { review_request: skill } : { skill });
    }

    if (action === 'reject_review') {
      requirePermission(context, 'skill.review.manage', { organizationId: context.activeOrganization.id });
      const id = String(body.id || '').trim();
      if (!id) return jsonError('id is required', 400);
      const note = String(body.note || '').trim();
      const skill = await rejectSkillReview(id, note);
      return jsonOk(isReviewRequest(skill) ? { review_request: skill } : { skill });
    }

    if (action === 'rollback') {
      const id = String(body.id || '').trim();
      const version = String(body.version || '').trim();
      if (!id || !version) return jsonError('id and version are required', 400);
      await requireSkillAccessBeforeAssetRead(context, id, 'skill.update');
      const sourceSkill = await getSkill(id);
      if (!sourceSkill) return jsonError('Skill not found', 404);
      const skill = await rollbackSkill(id, version);
      await persistSkillItems(context, [skill]);
      return jsonOk({ skill });
    }

    return jsonError(`Unsupported action: ${action}`, 400);
  } catch (error) {
    console.error('Skills POST error:', error);
    if (error instanceof SkillImportValidationError) {
      return jsonError(error.message, 400);
    }
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to update skills');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return jsonError('id is required', 400);
    await requireSkillAccessBeforeAssetRead(context, id, 'skill.delete');
    const sourceSkill = await getSkill(id);
    if (!sourceSkill) return jsonError('Skill not found', 404);
    await archiveSkill(id);
    return jsonOk({ success: true });
  } catch (error) {
    console.error('Skills DELETE error:', error);
    if (error instanceof AuthError) return jsonError(error.message, error.status);
    return jsonError(error instanceof Error ? error.message : 'Failed to delete skill');
  }
}
