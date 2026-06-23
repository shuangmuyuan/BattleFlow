import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils, KnowledgeClient } from 'coze-coding-dev-sdk';
import { streamClaudeCodeCliTurn } from '@/lib/agent-adapters/claude-code-cli';
import type { AgentEvent, AgentProvider } from '@/lib/agent-adapters/types';
import { cleanExecutableSkillText } from '@/lib/workflow-skill-draft';

export const runtime = 'nodejs';

type ChatRole = 'user' | 'assistant' | 'system';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface SkillDefinition {
  name?: string;
  description?: string;
  methodology?: string;
  outputs?: Record<string, unknown>;
  checklist?: string[];
  tools?: string[];
  prompt_template?: string;
  skill_md?: string;
  tuning_request?: string;
}

interface StepContext {
  step_name?: string;
  step_output?: string;
}

interface KnowledgeBaseContext {
  id?: string;
  name?: string;
  description?: string;
  dataset_name?: string;
  document_count?: number;
  updated_at?: string;
}

interface KnowledgeRetrievalChunk {
  content: string;
  source?: string;
  score?: number;
}

interface KnowledgeRetrievalContext {
  knowledge_base_id?: string;
  name?: string;
  dataset_name?: string;
  status: 'retrieved' | 'empty' | 'skipped' | 'error';
  error?: string;
  chunks: KnowledgeRetrievalChunk[];
}

interface ReviewMaterialContext {
  name?: string;
  source?: string;
  summary?: string;
}

interface UploadedFileContext {
  name?: string;
  type?: string;
  size?: number;
  contentKind?: string;
  content?: string;
  note?: string;
}

const CLAUDE_RUNTIME_SKILL_MISFIRE_MARKERS = [
  '/<skill-name>',
  'system-reminder',
  'available-skills',
  '可用 Skill 列表',
  '可用的 Skill',
  '已注册的可用 Skill',
  '没有看到任何已注册',
  '无法猜测或自行发明技能名称',
];

function sse(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system')
    && typeof message.content === 'string'
  );
}

function getString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function truncateForPrompt(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...（已截断）` : value;
}

function isClaudeRuntimeSkillMisfire(message: ChatMessage) {
  if (message.role !== 'assistant') return false;
  return CLAUDE_RUNTIME_SKILL_MISFIRE_MARKERS.some((marker) => message.content.includes(marker));
}

function normalizeBattleFlowSkillReferences(content: string) {
  return content
    .replace(/当前\s*Skill/g, '当前工作流节点方法说明')
    .replace(/当前\s*skill/gi, '当前工作流节点方法说明')
    .replace(/this\s+Skill/gi, 'this workflow step instruction')
    .replace(/current\s+Skill/gi, 'current workflow step instruction')
    .replace(/按\s*Skill\s*的要求/g, '按当前工作流节点方法说明的要求')
    .replace(/按当前\s*技能/g, '按当前工作流节点方法说明')
    .replace(/当前技能/g, '当前工作流节点方法说明');
}

function prepareMessagesForClaudeCodeCli(messages: ChatMessage[], hasWorkflowMethodPackage: boolean) {
  if (!hasWorkflowMethodPackage) return messages;

  return messages
    .filter((message) => !isClaudeRuntimeSkillMisfire(message))
    .map((message) => (
      message.role === 'user'
        ? { ...message, content: normalizeBattleFlowSkillReferences(message.content) }
        : message
    ));
}

function getChunkContent(chunk: Record<string, unknown>) {
  return getString(
    chunk.content,
    getString(chunk.text, getString(chunk.raw_data, getString(chunk.chunk))),
  );
}

function normalizeKnowledgeChunks(chunks: unknown): KnowledgeRetrievalChunk[] {
  if (!Array.isArray(chunks)) return [];
  const normalized: KnowledgeRetrievalChunk[] = [];

  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) continue;
    const record = chunk as Record<string, unknown>;
    const content = getChunkContent(record);
    if (!content) continue;
    const source = getString(record.source, getString(record.url, getString(record.document_name)));
    const score = getNumber(record.score);
    normalized.push({
      content: truncateForPrompt(content, 1600),
      ...(source ? { source } : {}),
      ...(typeof score === 'number' ? { score } : {}),
    });
  }

  return normalized;
}

function getLastUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'user')?.content || '';
}

async function retrieveKnowledgeContext(
  body: Record<string, unknown>,
  messages: ChatMessage[],
): Promise<KnowledgeRetrievalContext[]> {
  const selectedKnowledgeBases = Array.isArray(body.selected_knowledge_bases)
    ? body.selected_knowledge_bases as KnowledgeBaseContext[]
    : [];
  if (selectedKnowledgeBases.length === 0) return [];

  const query = getString(body.knowledge_query, getLastUserMessage(messages));
  if (!query.trim()) {
    return selectedKnowledgeBases.map((knowledgeBase) => ({
      knowledge_base_id: knowledgeBase.id,
      name: knowledgeBase.name,
      dataset_name: knowledgeBase.dataset_name,
      status: 'skipped',
      error: '缺少可用于检索的用户问题。',
      chunks: [],
    }));
  }

  const kbClient = new KnowledgeClient(new Config());
  const topK = 4;

  return Promise.all(selectedKnowledgeBases.map(async (knowledgeBase) => {
    if (!knowledgeBase.dataset_name) {
      return {
        knowledge_base_id: knowledgeBase.id,
        name: knowledgeBase.name,
        dataset_name: knowledgeBase.dataset_name,
        status: 'skipped' as const,
        error: '知识库缺少 dataset_name，无法检索。',
        chunks: [],
      };
    }

    try {
      const result = await kbClient.search(query, [knowledgeBase.dataset_name], topK, 0.3) as unknown as Record<string, unknown>;
      if (result.code !== 0) {
        return {
          knowledge_base_id: knowledgeBase.id,
          name: knowledgeBase.name,
          dataset_name: knowledgeBase.dataset_name,
          status: 'error' as const,
          error: getString(result.msg, '知识检索失败。'),
          chunks: [],
        };
      }

      const chunks = normalizeKnowledgeChunks(result.chunks);
      return {
        knowledge_base_id: knowledgeBase.id,
        name: knowledgeBase.name,
        dataset_name: knowledgeBase.dataset_name,
        status: chunks.length > 0 ? 'retrieved' as const : 'empty' as const,
        chunks,
      };
    } catch (error) {
      return {
        knowledge_base_id: knowledgeBase.id,
        name: knowledgeBase.name,
        dataset_name: knowledgeBase.dataset_name,
        status: 'error' as const,
        error: error instanceof Error ? error.message : '知识检索失败。',
        chunks: [],
      };
    }
  }));
}

function buildSystemPrompt(body: Record<string, unknown>) {
  const rawSkillDefinition = body.skill_definition as SkillDefinition | undefined;
  const skillDefinition = rawSkillDefinition
    ? {
      ...rawSkillDefinition,
      methodology: cleanExecutableSkillText(rawSkillDefinition.methodology, '', rawSkillDefinition.tuning_request),
      prompt_template: cleanExecutableSkillText(rawSkillDefinition.prompt_template, '', rawSkillDefinition.tuning_request),
      skill_md: cleanExecutableSkillText(rawSkillDefinition.skill_md, '', rawSkillDefinition.tuning_request),
    }
    : undefined;
  const stepContext = Array.isArray(body.step_context) ? body.step_context as StepContext[] : [];
  const selectedKnowledgeBases = Array.isArray(body.selected_knowledge_bases)
    ? body.selected_knowledge_bases as KnowledgeBaseContext[]
    : [];
  const knowledgeRetrievals = Array.isArray(body.knowledge_retrievals)
    ? body.knowledge_retrievals as KnowledgeRetrievalContext[]
    : [];
  const selectedReviewMaterials = Array.isArray(body.selected_review_materials)
    ? body.selected_review_materials as ReviewMaterialContext[]
    : [];
  const uploadedFiles = Array.isArray(body.uploaded_files) ? body.uploaded_files as UploadedFileContext[] : [];

  let systemPrompt = 'You are an expert product planning assistant. You help product planners create professional, well-structured requirement documents through collaborative dialogue.';

  if (skillDefinition) {
    systemPrompt += `\n\n## BattleFlow Workflow Method Binding\n${[
      `The workflow has already selected the active BattleFlow method package: ${skillDefinition.name || 'Unknown'}.`,
      'User references to the current method package, current workflow capability, or current step rules mean the BattleFlow method package described below.',
      'Do not interpret those references as a request to activate, list, or choose Claude Code or Codex runtime capabilities.',
      'Do not ask the user to provide a slash command or a capability name. Do not mention registered runtime capability lists or unavailable runtime capabilities.',
      'When the user asks to follow the current method package requirements, directly apply the methodology, prompt template, checklist, and output structure below.',
      'If an earlier assistant message asked the user to choose a runtime capability, treat it as an obsolete misinterpretation and continue with this active BattleFlow method package.',
    ].map((item) => `- ${item}`).join('\n')}\n`;

    systemPrompt += `\n\n## Active BattleFlow Method Package: ${skillDefinition.name || 'Unknown'}\n`;
    if (skillDefinition.description) {
      systemPrompt += `\n### Capability Description\n${skillDefinition.description}\n`;
    }
    if (skillDefinition.methodology) {
      systemPrompt += `\n### Methodology\n${skillDefinition.methodology}\n`;
    }
    if (skillDefinition.outputs) {
      systemPrompt += `\n### Expected Output Structure\n${JSON.stringify(skillDefinition.outputs, null, 2)}\n`;
    }
    if (skillDefinition.checklist && skillDefinition.checklist.length > 0) {
      systemPrompt += `\n### Quality Checklist\n${skillDefinition.checklist.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n`;
    }
    if (skillDefinition.tools && skillDefinition.tools.length > 0) {
      systemPrompt += `\n### Declared Planning Capabilities\n${skillDefinition.tools.join(', ')}\n`;
      systemPrompt += 'These tool names describe intended capabilities only. Do not claim you actually executed external tools unless the platform provides tool results in context.\n';
    }
    if (skillDefinition.prompt_template) {
      systemPrompt += `\n### Prompt Template\n${skillDefinition.prompt_template}\n`;
    }
    if (skillDefinition.skill_md) {
      systemPrompt += `\n### Full Method Instructions\n${skillDefinition.skill_md}\n`;
    }
  }

  if (stepContext.length > 0) {
    systemPrompt += '\n\n## Previous Steps Output (Context)\n';
    for (const ctx of stepContext) {
      systemPrompt += `\n### ${ctx.step_name || 'Previous Step'}\n${ctx.step_output || ''}\n`;
    }
  }

  if (selectedKnowledgeBases.length > 0) {
    systemPrompt += '\n\n## Selected Knowledge Bases\n';
    for (const knowledgeBase of selectedKnowledgeBases) {
      systemPrompt += `\n- ${knowledgeBase.name || '未知知识库'}：${knowledgeBase.description || '无描述'}；dataset=${knowledgeBase.dataset_name || '未配置'}；documents=${knowledgeBase.document_count ?? '未知'}`;
    }
    systemPrompt += '\n';
  }

  if (knowledgeRetrievals.length > 0) {
    systemPrompt += '\n\n## Retrieved Knowledge Chunks\n';
    for (const retrieval of knowledgeRetrievals) {
      systemPrompt += `\n### ${retrieval.name || '未知知识库'} (${retrieval.dataset_name || '未配置'})\n`;
      if (retrieval.status !== 'retrieved') {
        systemPrompt += `状态：${retrieval.status}${retrieval.error ? `；说明：${retrieval.error}` : ''}\n`;
        continue;
      }
      retrieval.chunks.forEach((chunk, index) => {
        const score = typeof chunk.score === 'number' ? `；score=${chunk.score.toFixed(3)}` : '';
        systemPrompt += `\n[Chunk ${index + 1}${score}${chunk.source ? `；source=${chunk.source}` : ''}]\n${chunk.content}\n`;
      });
    }
  }

  if (selectedReviewMaterials.length > 0) {
    systemPrompt += '\n\n## Selected Reviewed Materials\n';
    for (const material of selectedReviewMaterials) {
      systemPrompt += `\n### ${material.name || '未命名材料'}\n来源：${material.source || 'unknown'}\n${material.summary || ''}\n`;
    }
  }

  if (uploadedFiles.length > 0) {
    systemPrompt += '\n\n## Uploaded Context Files\n';
    for (const file of uploadedFiles) {
      systemPrompt += `\n### ${file.name || '未命名文件'}\n类型：${file.type || 'unknown'}；大小：${file.size || 0} bytes\n`;
      if (file.contentKind === 'text' && file.content) {
        systemPrompt += `${file.content}\n`;
      } else if (file.note) {
        systemPrompt += `${file.note}\n`;
      }
    }
  }

  systemPrompt += '\n\n## Instructions\n- Provide structured, professional output\n- If this is a methodology-driven workflow capability, follow the methodology steps\n- Reference context from previous steps when relevant\n- Be thorough but concise\n- Use markdown formatting for better readability';
  systemPrompt += '\n- Never ask the user to choose a Claude Code or Codex runtime capability. The BattleFlow workflow step has already supplied the active method package when one is available.';
  systemPrompt += '\n- When a step is ready to be confirmed, make the durable deliverable a standalone Markdown document that can be saved as this workflow step output. Avoid making the saved deliverable depend on conversational wording such as greetings or follow-up chatter.';

  return systemPrompt;
}

function streamAgentEventsAsSse(agentStream: ReadableStream<AgentEvent>) {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const reader = agentStream.getReader();
      let closed = false;

      const closeWith = (payload: Record<string, unknown>) => {
        if (closed) return;
        closed = true;
        try {
          controller.enqueue(encoder.encode(sse(payload)));
        } catch {
          // The browser may have cancelled the request after a long generation.
        }
        try {
          controller.close();
        } catch {
          // Ignore duplicate close attempts from child process shutdown races.
        }
      };

      const emit = (payload: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(payload)));
        } catch {
          closed = true;
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          if (value.type === 'assistant_message') {
            emit({ content: value.text });
          } else if (value.type === 'session_status') {
            emit({
              event: 'session_status',
              status: value.status,
              session_id: value.sessionId,
              done: value.status === 'done',
            });
            if (value.status === 'done') {
              closeWith({ done: true });
              return;
            }
          } else if (value.type === 'usage') {
            emit({
              event: 'usage',
              input_tokens: value.inputTokens,
              output_tokens: value.outputTokens,
              cost_usd: value.costUsd,
              model: value.model,
            });
          } else if (value.type === 'terminal_output') {
            emit({
              event: 'terminal_output',
              stream: value.stream,
              text: value.text,
            });
          } else if (value.type === 'error') {
            closeWith({ error: value.error });
            return;
          }
        }
        closeWith({ done: true });
      } catch (error) {
        closeWith({ error: error instanceof Error ? error.message : 'Agent stream interrupted' });
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}

function streamClaudeCodeCli(request: NextRequest, messages: ChatMessage[], systemPrompt: string) {
  return streamAgentEventsAsSse(streamClaudeCodeCliTurn({
    messages,
    systemPrompt,
    signal: request.signal,
  }));
}

function streamCozeSdk(request: NextRequest, messages: ChatMessage[], systemPrompt: string, modelId?: string) {
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const config = new Config();
  const client = new LLMClient(config, customHeaders);
  const fullMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages,
  ];
  const stream = client.stream(fullMessages, {
    model: modelId || 'doubao-seed-2-0-pro-260215',
    temperature: 0.7,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.content) {
            controller.enqueue(encoder.encode(sse({ content: chunk.content.toString() })));
          }
        }
        controller.enqueue(encoder.encode(sse({ done: true })));
        controller.close();
      } catch (error) {
        console.error('Coze SDK stream error:', error);
        controller.enqueue(encoder.encode(sse({ error: 'Model stream interrupted' })));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Transfer-Encoding': 'chunked',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const messages = Array.isArray(body.messages) ? body.messages.filter(isChatMessage) : [];

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const knowledgeRetrievals = await retrieveKnowledgeContext(body, messages);
    const systemPrompt = buildSystemPrompt({
      ...body,
      knowledge_retrievals: knowledgeRetrievals,
    });
    const provider = String(body.agent_provider || process.env.CHAT_AGENT_PROVIDER || 'claude-code-cli') as AgentProvider;
    if (provider === 'coze-sdk') {
      const modelId = typeof body.model_id === 'string' ? body.model_id : undefined;
      return streamCozeSdk(request, messages, systemPrompt, modelId);
    }

    const claudeMessages = prepareMessagesForClaudeCodeCli(messages, Boolean(body.skill_definition));
    return streamClaudeCodeCli(request, claudeMessages, systemPrompt);
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Chat failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
