import { NextRequest, NextResponse } from 'next/server';
import {
  archiveSkill,
  approveSkillReview,
  createWorkflowSkillReview,
  getSkill,
  importSkillFromGit,
  importSkillFromPath,
  importSkillFromUpload,
  listSkills,
  rejectSkillReview,
  renderSkillMarkdown,
  requestSkillReview,
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

// GET /api/skills - list, detail, or markdown download
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const scope = searchParams.get('scope') || undefined;
    const status = searchParams.get('status') || undefined;
    const downloadVersion = searchParams.get('downloadVersion') || undefined;
    const inline = searchParams.get('inline') === '1';

    if (id && downloadVersion !== undefined) {
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
      const skill = await getSkill(id);
      if (!skill) return jsonError('Skill not found', 404);
      return jsonOk({ skill });
    }

    const skills = await listSkills({ scope, status });
    return jsonOk({ skills });
  } catch (error) {
    console.error('Skills GET error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to fetch skills');
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
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
      return jsonOk({ skills });
    }

    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'import_path') {
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
      return jsonOk({ skills });
    }

    if (action === 'import_git') {
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
      return jsonOk({ skills });
    }

    if (action === 'import_registry') {
      return jsonError('Remote registry import API is reserved for a later integration', 501);
    }

    if (action === 'publish_request') {
      const id = String(body.id || '').trim();
      if (!id) return jsonError('id is required', 400);
      const note = String(body.note || '').trim();
      const skill = await requestSkillReview(id, note);
      return jsonOk({ skill });
    }

    if (action === 'submit_workflow_draft') {
      const draft = body.draft && typeof body.draft === 'object' ? body.draft : null;
      if (!draft) return jsonError('draft is required', 400);
      const skill = await createWorkflowSkillReview({
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
      return jsonOk({ skill });
    }

    if (action === 'approve_publish') {
      const id = String(body.id || '').trim();
      if (!id) return jsonError('id is required', 400);
      const note = String(body.note || '').trim();
      const skill = await approveSkillReview(id, note);
      return jsonOk({ skill });
    }

    if (action === 'reject_review') {
      const id = String(body.id || '').trim();
      if (!id) return jsonError('id is required', 400);
      const note = String(body.note || '').trim();
      const skill = await rejectSkillReview(id, note);
      return jsonOk({ skill });
    }

    if (action === 'rollback') {
      const id = String(body.id || '').trim();
      const version = String(body.version || '').trim();
      if (!id || !version) return jsonError('id and version are required', 400);
      const skill = await rollbackSkill(id, version);
      return jsonOk({ skill });
    }

    return jsonError(`Unsupported action: ${action}`, 400);
  } catch (error) {
    console.error('Skills POST error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to update skills');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return jsonError('id is required', 400);
    await archiveSkill(id);
    return jsonOk({ success: true });
  } catch (error) {
    console.error('Skills DELETE error:', error);
    return jsonError(error instanceof Error ? error.message : 'Failed to delete skill');
  }
}
