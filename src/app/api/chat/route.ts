import { spawn } from 'node:child_process';
import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils, KnowledgeClient } from 'coze-coding-dev-sdk';

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
  const skillDefinition = body.skill_definition as SkillDefinition | undefined;
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
    systemPrompt += `\n\n## Current Skill: ${skillDefinition.name || 'Unknown'}\n`;
    if (skillDefinition.description) {
      systemPrompt += `\n### Skill Description\n${skillDefinition.description}\n`;
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
      systemPrompt += `\n### Declared Skill Tools\n${skillDefinition.tools.join(', ')}\n`;
      systemPrompt += 'These tool names describe intended capabilities only. Do not claim you actually executed external tools unless the platform provides tool results in context.\n';
    }
    if (skillDefinition.prompt_template) {
      systemPrompt += `\n### Prompt Template\n${skillDefinition.prompt_template}\n`;
    }
    if (skillDefinition.skill_md) {
      systemPrompt += `\n### Full Skill Instructions\n${skillDefinition.skill_md}\n`;
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

  systemPrompt += '\n\n## Instructions\n- Provide structured, professional output\n- If this is a methodology-driven skill, follow the methodology steps\n- Reference context from previous steps when relevant\n- Be thorough but concise\n- Use markdown formatting for better readability';
  systemPrompt += '\n- When a step is ready to be confirmed, make the durable deliverable a standalone Markdown document that can be saved as this skill step output. Avoid making the saved deliverable depend on conversational wording such as greetings or follow-up chatter.';

  return systemPrompt;
}

function buildConversationPrompt(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}:\n${message.content}`)
    .join('\n\n');
}

function streamClaudeCli(request: NextRequest, messages: ChatMessage[], systemPrompt: string) {
  const encoder = new TextEncoder();
  const model = process.env.CLAUDE_MODEL || 'sonnet';
  const maxBudgetUsd = process.env.CLAUDE_MAX_BUDGET_USD || '0.25';
  const cwd = process.env.CLAUDE_WORKSPACE_DIR || process.cwd();
  const prompt = buildConversationPrompt(messages);

  const args = [
    '-p',
    '--safe-mode',
    '--no-session-persistence',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--model',
    model,
    '--max-budget-usd',
    maxBudgetUsd,
    '--tools',
    '',
    '--permission-mode',
    'dontAsk',
    '--system-prompt',
    systemPrompt,
    prompt,
  ];

  let child: ReturnType<typeof spawn> | null = null;

  const readable = new ReadableStream({
    start(controller) {
      child = spawn('claude', args, {
        cwd,
        env: {
          ...process.env,
          CI: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let sawContentDelta = false;
      let finalResult = '';
      let closed = false;

      const closeWith = (payload: Record<string, unknown>) => {
        if (closed) return;
        closed = true;
        controller.enqueue(encoder.encode(sse(payload)));
        controller.close();
      };

      const emitContent = (content: string) => {
        if (!content) return;
        sawContentDelta = true;
        controller.enqueue(encoder.encode(sse({ content })));
      };

      const handleLine = (line: string) => {
        if (!line.trim()) return;
        try {
          const event = JSON.parse(line) as Record<string, unknown>;
          if (event.type === 'stream_event') {
            const streamEvent = event.event as Record<string, unknown> | undefined;
            const delta = streamEvent?.delta as Record<string, unknown> | undefined;
            if (streamEvent?.type === 'content_block_delta' && typeof delta?.text === 'string') {
              emitContent(delta.text);
            }
          }
          if (event.type === 'result') {
            if (typeof event.result === 'string') finalResult = event.result;
            if (event.is_error) {
              closeWith({ error: event.result || 'Claude CLI request failed' });
            }
          }
        } catch {
          stderrBuffer += `${line}\n`;
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';
        for (const line of lines) handleLine(line);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString('utf8');
        if (stderrBuffer.length > 4000) stderrBuffer = stderrBuffer.slice(-4000);
      });

      child.on('error', (error) => {
        closeWith({ error: `Claude CLI unavailable: ${error.message}` });
      });

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        if (closed) return;
        if (code && code !== 0) {
          closeWith({ error: stderrBuffer.trim() || `Claude CLI exited with code ${code}` });
          return;
        }
        if (!sawContentDelta && finalResult) {
          controller.enqueue(encoder.encode(sse({ content: finalResult })));
        }
        closeWith({ done: true });
      });

      request.signal.addEventListener('abort', () => {
        child?.kill('SIGTERM');
      });
    },
    cancel() {
      child?.kill('SIGTERM');
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
    const provider = String(body.agent_provider || process.env.CHAT_AGENT_PROVIDER || 'claude-cli');
    if (provider === 'coze-sdk') {
      const modelId = typeof body.model_id === 'string' ? body.model_id : undefined;
      return streamCozeSdk(request, messages, systemPrompt, modelId);
    }

    return streamClaudeCli(request, messages, systemPrompt);
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Chat failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
