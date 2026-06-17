import { NextResponse } from 'next/server';
import { getSkill } from '@/lib/skill-registry';
import {
  generateWorkflowSkillDraft,
  type SkillTuningContextMessage,
  type SkillTuningStepOutput,
} from '@/lib/skill-tuning';

export const runtime = 'nodejs';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getMessages(value: unknown): SkillTuningContextMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: getString(item.content),
    }))
    .filter((item) => item.content);
}

function getStepOutputs(value: unknown): SkillTuningStepOutput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      name: getString(item.name),
      output: getString(item.output),
    }))
    .filter((item) => item.name && item.output);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const baseSkillId = getString(body.baseSkillId);
    const instruction = getString(body.instruction);
    const workflowId = getString(body.workflowId);
    const workflowName = getString(body.workflowName);
    const stepId = getString(body.stepId);
    const stepName = getString(body.stepName);

    if (!baseSkillId) return jsonError('baseSkillId is required');
    if (!instruction) return jsonError('instruction is required');
    if (!workflowId || !stepId) return jsonError('workflowId and stepId are required');

    const baseSkill = await getSkill(baseSkillId);
    if (!baseSkill) return jsonError(`Skill not found: ${baseSkillId}`, 404);

    const draft = await generateWorkflowSkillDraft({
      workflowId,
      workflowName,
      stepId,
      stepName,
      instruction,
      baseSkill,
      currentOutput: getString(body.currentOutput),
      recentMessages: getMessages(body.recentMessages),
      previousOutputs: getStepOutputs(body.previousOutputs),
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error('Skill tuning API error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate Skill tuning draft';
    return jsonError(message, 500);
  }
}
