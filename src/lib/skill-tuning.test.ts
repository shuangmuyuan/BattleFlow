import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillRecord } from './skill-registry';

const mocks = vi.hoisted(() => ({
  runClaudeAgentSdkPrompt: vi.fn(),
}));

vi.mock('./agent-adapters/claude-agent-sdk', () => ({
  runClaudeAgentSdkPrompt: mocks.runClaudeAgentSdkPrompt,
}));

import { generateWorkflowSkillDraft } from './skill-tuning';

const generatedDraftSections = [
  '=== NAME ===',
  '產品規劃優化',
  '=== DESCRIPTION ===',
  '補充關鍵風險與驗證標準。',
  '=== METHODOLOGY ===',
  '梳理使用者需求，產出風險假設。',
  '=== TOOLS ===',
  '- knowledge_query',
  '=== OUTPUTS_JSON ===',
  '{"sections":["風險假設","驗證標準"]}',
  '=== CHECKLIST ===',
  '- 覆蓋關鍵風險',
  '=== ACCEPTANCE_CRITERIA ===',
  '- 產物包含驗證標準',
  '=== REQUIRED_SECTIONS ===',
  '- 風險假設',
  '=== EVIDENCE_RULES ===',
  '- 標註資料來源',
  '=== FAILURE_CONDITIONS ===',
  '- 缺少關鍵風險',
  '=== TAGS ===',
  '- planning',
  '=== PROMPT_TEMPLATE ===',
  '請產出產品規劃草稿。',
  '=== SKILL_MD ===',
  '# 產品規劃\n\n產出關鍵風險與驗證標準。',
  '=== TUNING_REQUEST ===',
  '保留繁體原文：請強化風險',
  '=== CHANGE_SUMMARY ===',
  '新增風險與驗證標準。',
  '=== CHANGE_ITEMS ===',
  '- 補充風險假設',
  '- 補充驗證標準',
  '=== VALIDATION_NOTE ===',
  '確認產物覆蓋風險。',
  '=== QUALITY_GATES ===',
  '- 檢查驗證標準',
  '=== SOURCE_CONTEXT_SUMMARY ===',
  '基於目前對話調整。',
].join('\n');

function baseSkill(): SkillRecord {
  return {
    id: 'skill-1',
    skill_id: 'skill-1',
    display_name: 'Product planning',
    name: 'Product planning',
    description: 'Plan products',
    version: '1.0.0',
    author: 'BattleFlow',
    tags: ['planning'],
    source_type: 'local',
    scope: 'official',
    status: 'published',
    methodology: 'Plan the product.',
    tools: ['knowledge_query'],
    outputs: { sections: ['Summary'] },
    checklist: ['Complete'],
    prompt_template: 'Plan.',
    skill_md: '# Product planning\n\nPlan.',
    meta_json: {},
    changelog: '',
    attachments: [],
    package_assets: [],
    created_at: '2026-07-04T00:00:00.000Z',
    updated_at: '2026-07-04T00:00:00.000Z',
    versions: [],
    is_active: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runClaudeAgentSdkPrompt.mockResolvedValue({ text: generatedDraftSections });
});

describe('skill tuning generation', () => {
  it('normalizes generated draft strings to Simplified Chinese while preserving the original tuning request', async () => {
    const draft = await generateWorkflowSkillDraft({
      workflowId: 'workflow-1',
      workflowName: 'Workflow',
      stepId: 'step-1',
      stepName: 'Step',
      instruction: '保留繁體原文：請強化風險',
      baseSkill: baseSkill(),
    });

    expect(draft.name).toBe('产品规划优化');
    expect(draft.description).toBe('补充关键风险与验证标准。');
    expect(draft.methodology).toBe('梳理使用者需求，产出风险假设。');
    expect(draft.outputs).toEqual({ sections: ['风险假设', '验证标准'] });
    expect(draft.skill_md).toContain('产品规划');
    expect(draft.skill_md).toContain('产出关键风险与验证标准。');
    expect(draft.change_summary).toBe('新增风险与验证标准。');
    expect(draft.change_items).toEqual(['补充风险假设', '补充验证标准']);
    expect(draft.quality_gates).toEqual(['检查验证标准']);
    expect(draft.tuning_request).toBe('保留繁體原文：請強化風險');
    expect(draft.generator).toBe('claude-agent-sdk');
  });
});
