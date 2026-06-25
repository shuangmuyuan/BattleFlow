import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { SkillRecord } from './skill-registry';
import { cleanExecutableSkillText } from './workflow-skill-draft';

interface ClaudeCodeStreamEvent {
  type?: string;
  is_error?: boolean;
  result?: string;
  event?: {
    type?: string;
    delta?: {
      type?: string;
      text?: string;
    };
  };
}

export interface SkillTuningContextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SkillTuningStepOutput {
  name: string;
  output: string;
}

export interface GenerateWorkflowSkillDraftInput {
  workflowId: string;
  workflowName: string;
  stepId: string;
  stepName: string;
  instruction: string;
  baseSkill: SkillRecord;
  currentOutput?: string;
  recentMessages?: SkillTuningContextMessage[];
  previousOutputs?: SkillTuningStepOutput[];
}

export interface GeneratedWorkflowSkillDraft {
  id: string;
  stepId: string;
  baseSkillId: string;
  baseSkillVersion?: string;
  name: string;
  description: string;
  methodology: string;
  tools: string[];
  outputs: Record<string, unknown>;
  checklist: string[];
  acceptanceCriteria?: string[];
  requiredSections?: string[];
  evidenceRules?: string[];
  failureConditions?: string[];
  tags: string[];
  prompt_template?: string;
  skill_md: string;
  tuning_request: string;
  change_summary: string;
  change_items: string[];
  validation_note?: string;
  quality_gates: string[];
  source_context_summary?: string;
  enabled: boolean;
  status: 'draft';
  generator: 'claude-code-cli';
  created_at: string;
  updated_at: string;
}

interface RawGeneratedDraft {
  name?: unknown;
  description?: unknown;
  methodology?: unknown;
  tools?: unknown;
  outputs?: unknown;
  checklist?: unknown;
  acceptanceCriteria?: unknown;
  requiredSections?: unknown;
  evidenceRules?: unknown;
  failureConditions?: unknown;
  tags?: unknown;
  prompt_template?: unknown;
  skill_md?: unknown;
  tuning_request?: unknown;
  change_summary?: unknown;
  change_items?: unknown;
  validation_note?: unknown;
  quality_gates?: unknown;
  source_context_summary?: unknown;
}

const MAX_CONTEXT_CHARS = 9000;

function getClaudeCommand() {
  return process.env.CLAUDE_COMMAND || 'claude';
}

function getClaudeModel() {
  return process.env.CLAUDE_MODEL || 'sonnet';
}

function getClaudeMaxBudgetUsd() {
  return process.env.CLAUDE_MAX_BUDGET_USD || '1.00';
}

function getClaudeWorkspaceDir() {
  return process.env.CLAUDE_WORKSPACE_DIR || process.cwd();
}

function truncateText(value: string | undefined, maxLength: number) {
  const text = (value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n...[已截断 ${text.length - maxLength} 字符]`;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asStringArray(value: unknown, fallback: string[] = []) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : fallback;
}

function asRecord(value: unknown, fallback: Record<string, unknown> = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : fallback;
}

function extractJsonObject(text: string): RawGeneratedDraft {
  const withoutFence = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Claude CLI did not return a JSON object');
  }

  return JSON.parse(withoutFence.slice(start, end + 1)) as RawGeneratedDraft;
}

function extractSectionValue(sections: Record<string, string>, key: string) {
  return sections[key]?.trim() || '';
}

function parseSectionList(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return asStringArray(parsed);
  } catch {
    return trimmed
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }
}

function parseSections(text: string) {
  const matches = [...text.matchAll(/^===\s*([A-Z_]+)\s*===\s*$/gm)];
  if (matches.length === 0) return null;

  const sections: Record<string, string> = {};
  matches.forEach((match, index) => {
    const key = match[1];
    const contentStart = (match.index || 0) + match[0].length;
    const contentEnd = index + 1 < matches.length ? matches[index + 1].index || text.length : text.length;
    sections[key] = text.slice(contentStart, contentEnd).trim();
  });
  return sections;
}

function extractGeneratedDraft(text: string): RawGeneratedDraft {
  const sections = parseSections(text);
  if (sections) {
    let outputs: Record<string, unknown> = {};
    const outputsValue = extractSectionValue(sections, 'OUTPUTS_JSON');
    if (outputsValue) {
      try {
        outputs = asRecord(JSON.parse(outputsValue), {});
      } catch {
        outputs = {};
      }
    }

    return {
      name: extractSectionValue(sections, 'NAME'),
      description: extractSectionValue(sections, 'DESCRIPTION'),
      methodology: extractSectionValue(sections, 'METHODOLOGY'),
      tools: parseSectionList(extractSectionValue(sections, 'TOOLS')),
      outputs,
      checklist: parseSectionList(extractSectionValue(sections, 'CHECKLIST')),
      acceptanceCriteria: parseSectionList(extractSectionValue(sections, 'ACCEPTANCE_CRITERIA')),
      requiredSections: parseSectionList(extractSectionValue(sections, 'REQUIRED_SECTIONS')),
      evidenceRules: parseSectionList(extractSectionValue(sections, 'EVIDENCE_RULES')),
      failureConditions: parseSectionList(extractSectionValue(sections, 'FAILURE_CONDITIONS')),
      tags: parseSectionList(extractSectionValue(sections, 'TAGS')),
      prompt_template: extractSectionValue(sections, 'PROMPT_TEMPLATE'),
      skill_md: extractSectionValue(sections, 'SKILL_MD'),
      tuning_request: extractSectionValue(sections, 'TUNING_REQUEST'),
      change_summary: extractSectionValue(sections, 'CHANGE_SUMMARY'),
      change_items: parseSectionList(extractSectionValue(sections, 'CHANGE_ITEMS')),
      validation_note: extractSectionValue(sections, 'VALIDATION_NOTE'),
      quality_gates: parseSectionList(extractSectionValue(sections, 'QUALITY_GATES')),
      source_context_summary: extractSectionValue(sections, 'SOURCE_CONTEXT_SUMMARY'),
    };
  }

  return extractJsonObject(text);
}

function runClaudeCli(systemPrompt: string, prompt: string, timeoutMs = 120_000) {
  return new Promise<string>((resolve, reject) => {
    const command = getClaudeCommand();
    const args = [
      '-p',
      '--safe-mode',
      '--no-session-persistence',
      '--verbose',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--model',
      getClaudeModel(),
      '--max-budget-usd',
      getClaudeMaxBudgetUsd(),
      '--tools',
      '',
      '--permission-mode',
      'dontAsk',
      '--system-prompt',
      systemPrompt,
      prompt,
    ];

    const child = spawn(command, args, {
      cwd: getClaudeWorkspaceDir(),
      env: {
        ...process.env,
        CI: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let finalResult = '';
    let deltaText = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude Code CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line) as ClaudeCodeStreamEvent;
        if (event.type === 'stream_event' && event.event?.type === 'content_block_delta') {
          deltaText += event.event.delta?.text || '';
          return;
        }
        if (event.type === 'result') {
          if (event.is_error) {
            throw new Error(event.result || 'Claude Code CLI request failed');
          }
          finalResult = event.result || finalResult;
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          stderrBuffer += `${line}\n`;
          return;
        }
        throw error;
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      try {
        for (const line of lines) handleLine(line);
      } catch (error) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        reject(error);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
      if (stderrBuffer.length > 6000) stderrBuffer = stderrBuffer.slice(-6000);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Claude Code CLI unavailable: ${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (stdoutBuffer.trim()) {
        try {
          handleLine(stdoutBuffer);
        } catch (error) {
          reject(error);
          return;
        }
      }
      if (code && code !== 0) {
        reject(new Error(stderrBuffer.trim() || `Claude Code CLI exited with code ${code}`));
        return;
      }
      const result = (finalResult || deltaText).trim();
      if (!result) {
        reject(new Error(stderrBuffer.trim() || 'Claude Code CLI returned empty output'));
        return;
      }
      resolve(result);
    });
  });
}

function buildPrompt(input: GenerateWorkflowSkillDraftInput) {
  const baseSkill = input.baseSkill;
  const context = {
    workflow: {
      id: input.workflowId,
      name: input.workflowName,
    },
    step: {
      id: input.stepId,
      name: input.stepName,
    },
    tuning_goal: input.instruction,
    current_step_output: truncateText(input.currentOutput, 2400),
    previous_outputs: (input.previousOutputs || []).map((item) => ({
      name: item.name,
      output: truncateText(item.output, 1600),
    })),
    recent_messages: (input.recentMessages || []).slice(-8).map((message) => ({
      role: message.role,
      content: truncateText(message.content, 900),
    })),
  };

  const baseSkillPayload = {
    id: baseSkill.id,
    name: baseSkill.name,
    description: baseSkill.description,
    version: baseSkill.version,
    methodology: baseSkill.methodology,
    tools: baseSkill.tools,
    outputs: baseSkill.outputs,
    checklist: baseSkill.checklist,
    acceptanceCriteria: baseSkill.acceptanceCriteria || [],
    requiredSections: baseSkill.requiredSections || [],
    evidenceRules: baseSkill.evidenceRules || [],
    failureConditions: baseSkill.failureConditions || [],
    tags: baseSkill.tags,
    prompt_template: baseSkill.prompt_template,
    skill_md: truncateText(baseSkill.skill_md, 5000),
  };

  return [
    '你正在为 BattleFlow 的工作流节点生成一个可验证的 Skill 调优草稿。',
    '请基于“基线 Skill”和“调优上下文”产出一个完整草稿，而不是追加几句提示。',
    '',
    '要求：',
    '1. 保留基线 Skill 的核心身份和适用边界，只针对用户调优目标做必要修改。',
    '2. 输出必须能直接作为 Skill 使用，包含完整 skill_md 和 prompt_template。',
    '3. 严格隔离“调优请求”和“执行态 Skill 定义”：调优请求只放入 TUNING_REQUEST / CHANGE_SUMMARY / CHANGE_ITEMS，不得复制到 METHODOLOGY、PROMPT_TEMPLATE、SKILL_MD。',
    '4. METHODOLOGY、PROMPT_TEMPLATE、SKILL_MD 必须像正式团队 Skill 一样描述执行方法，不要出现“分析当前 Skill”“调优目标”“验证此调优草稿”“工作流调优要求”等元话语。',
    '5. 不要编造工具能力；tools 默认沿用基线，只有在调优目标明确要求时才调整。',
    '6. change_items 应该是 3-6 条面向审核人的具体变更点。',
    '7. acceptance criteria、required sections、evidence rules、failure conditions 应该描述该 Skill 产物的可验证验收契约；默认保留基线契约，并结合调优目标让标准更明确。',
    '8. quality_gates 应该是验证这个草稿是否生效的检查点。',
    '9. 只返回下方固定分区格式，不要 Markdown 代码块，不要解释文字。',
    '',
    '固定分区格式：',
    '=== NAME ===',
    '一行名称',
    '=== DESCRIPTION ===',
    '一段描述',
    '=== METHODOLOGY ===',
    '完整方法论文本',
    '=== TOOLS ===',
    '- tool_name',
    '=== OUTPUTS_JSON ===',
    '{"format":"structured_markdown"}',
    '=== CHECKLIST ===',
    '- 检查点',
    '=== ACCEPTANCE_CRITERIA ===',
    '- 可验证验收标准',
    '=== REQUIRED_SECTIONS ===',
    '- 必须包含的章节',
    '=== EVIDENCE_RULES ===',
    '- 证据、来源或假设标注规则',
    '=== FAILURE_CONDITIONS ===',
    '- 一旦出现就必须判定失败的情况',
    '=== TAGS ===',
    '- tag',
    '=== PROMPT_TEMPLATE ===',
    '完整提示词模板',
    '=== SKILL_MD ===',
    '完整 SKILL.md 内容',
    '=== TUNING_REQUEST ===',
    '用户原始调优请求，仅作为元数据',
    '=== CHANGE_SUMMARY ===',
    '一段审核摘要',
    '=== CHANGE_ITEMS ===',
    '- 具体变更点',
    '=== VALIDATION_NOTE ===',
    '验证说明',
    '=== QUALITY_GATES ===',
    '- 验证门禁',
    '=== SOURCE_CONTEXT_SUMMARY ===',
    '上下文摘要',
    '',
    '基线 Skill:',
    JSON.stringify(baseSkillPayload, null, 2),
    '',
    '调优上下文:',
    truncateText(JSON.stringify(context, null, 2), MAX_CONTEXT_CHARS),
  ].join('\n');
}

function buildRepairPrompt(rawText: string) {
  return [
    '下面是一段模型输出，它本应是 BattleFlow Skill 调优固定分区格式，但格式不完整。',
    '请只修复为固定分区格式，保留字段含义，不要新增解释。',
    '返回固定分区格式，不要 Markdown 代码块。',
    '',
    '原始输出：',
    truncateText(rawText, 12000),
  ].join('\n');
}

export async function generateWorkflowSkillDraft(input: GenerateWorkflowSkillDraftInput): Promise<GeneratedWorkflowSkillDraft> {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('Tuning instruction is required');

  const systemPrompt = [
    'You are a senior AI product workflow architect and Skill editor.',
    'You produce production-ready Skill drafts for BattleFlow.',
    'You must return only valid JSON matching the requested schema.',
  ].join('\n');
  const rawText = await runClaudeCli(systemPrompt, buildPrompt({ ...input, instruction }));
  let rawDraft: RawGeneratedDraft;
  try {
    rawDraft = extractGeneratedDraft(rawText);
  } catch {
    const repairedText = await runClaudeCli(
      'You repair malformed structured text. Return only the requested section format.',
      buildRepairPrompt(rawText),
      90_000,
    );
    rawDraft = extractGeneratedDraft(repairedText);
  }
  const now = new Date().toISOString();
  const baseSkill = input.baseSkill;
  const tuningRequest = asString(rawDraft.tuning_request, instruction) || instruction;
  const skillMd = cleanExecutableSkillText(asString(rawDraft.skill_md, baseSkill.skill_md), baseSkill.skill_md, tuningRequest);
  if (!skillMd.trim()) throw new Error('Generated draft is missing skill_md');

  const promptTemplate = cleanExecutableSkillText(
    asString(rawDraft.prompt_template, baseSkill.prompt_template || ''),
    baseSkill.prompt_template || '',
    tuningRequest,
  );
  const methodology = cleanExecutableSkillText(
    asString(rawDraft.methodology, baseSkill.methodology),
    baseSkill.methodology,
    tuningRequest,
  );
  const changeItems = asStringArray(rawDraft.change_items, []);
  const qualityGates = asStringArray(rawDraft.quality_gates, []);
  const outputs = asRecord(rawDraft.outputs, baseSkill.outputs);
  const outputSections = asStringArray(asRecord(outputs).sections);
  const acceptanceCriteria = asStringArray(
    rawDraft.acceptanceCriteria,
    baseSkill.acceptanceCriteria?.length ? baseSkill.acceptanceCriteria : qualityGates,
  );
  const requiredSections = asStringArray(
    rawDraft.requiredSections,
    baseSkill.requiredSections?.length ? baseSkill.requiredSections : outputSections,
  );
  const evidenceRules = asStringArray(rawDraft.evidenceRules, baseSkill.evidenceRules || []);
  const failureConditions = asStringArray(rawDraft.failureConditions, baseSkill.failureConditions || []);
  const checklist = Array.from(new Set([
    ...asStringArray(rawDraft.checklist, baseSkill.checklist),
    ...qualityGates,
  ]));
  const tags = Array.from(new Set([
    'workflow-tuning',
    ...asStringArray(rawDraft.tags, baseSkill.tags),
  ]));

  return {
    id: `skill-draft-${randomUUID()}`,
    stepId: input.stepId,
    baseSkillId: baseSkill.id,
    baseSkillVersion: baseSkill.version,
    name: asString(rawDraft.name, baseSkill.name),
    description: asString(rawDraft.description, baseSkill.description),
    methodology,
    tools: asStringArray(rawDraft.tools, baseSkill.tools),
    outputs,
    checklist,
    acceptanceCriteria,
    requiredSections,
    evidenceRules,
    failureConditions,
    tags,
    prompt_template: promptTemplate || undefined,
    skill_md: skillMd,
    tuning_request: tuningRequest,
    change_summary: asString(rawDraft.change_summary, changeItems.join('\n') || instruction),
    change_items: changeItems.length > 0 ? changeItems : [instruction],
    validation_note: asString(rawDraft.validation_note, `在工作流「${input.workflowName}」的「${input.stepName}」节点验证。`),
    quality_gates: qualityGates,
    source_context_summary: asString(rawDraft.source_context_summary) || undefined,
    enabled: true,
    status: 'draft',
    generator: 'claude-code-cli',
    created_at: now,
    updated_at: now,
  };
}
