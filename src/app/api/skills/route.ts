import { NextRequest, NextResponse } from 'next/server';
import {
  archiveSkill,
  approveSkillReview,
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
      const skills = await importSkillFromUpload(file, {
        scope,
        sourceType: 'local',
        status: importStatusForScope(scope),
      });
      return jsonOk({ skills });
    }

    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'import_path') {
      const inputPath = String(body.path || '').trim();
      if (!inputPath) return jsonError('path is required', 400);
      const scope = getScope(body.scope);
      const skills = await importSkillFromPath(inputPath, {
        scope,
        sourceType: 'local',
        sourceUri: inputPath,
        status: importStatusForScope(scope),
      });
      return jsonOk({ skills });
    }

    if (action === 'import_git') {
      const url = String(body.url || '').trim();
      if (!url) return jsonError('url is required', 400);
      const scope = getScope(body.scope);
      const skills = await importSkillFromGit(url, {
        scope,
        sourceType: 'git',
        sourceUri: url,
        status: importStatusForScope(scope),
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
