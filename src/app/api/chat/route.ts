import { NextRequest } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      model_id,
      skill_definition,
      step_context,
      selected_knowledge_bases,
      selected_review_materials,
      uploaded_files,
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    // Build system prompt with skill definition and context
    let systemPrompt = 'You are an expert product planning assistant. You help product planners create professional, well-structured requirement documents through collaborative dialogue.';

    if (skill_definition) {
      systemPrompt += `\n\n## Current Skill: ${skill_definition.name || 'Unknown'}\n`;
      if (skill_definition.methodology) {
        systemPrompt += `\n### Methodology\n${skill_definition.methodology}\n`;
      }
      if (skill_definition.outputs) {
        systemPrompt += `\n### Expected Output Structure\n${JSON.stringify(skill_definition.outputs, null, 2)}\n`;
      }
      if (skill_definition.checklist && skill_definition.checklist.length > 0) {
        systemPrompt += `\n### Quality Checklist\n${skill_definition.checklist.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}\n`;
      }
      if (skill_definition.tools && skill_definition.tools.length > 0) {
        systemPrompt += `\n### Available Tools\n${skill_definition.tools.join(', ')}\n`;
      }
      if (skill_definition.prompt_template) {
        systemPrompt += `\n### Prompt Template\n${skill_definition.prompt_template}\n`;
      }
    }

    if (step_context && step_context.length > 0) {
      systemPrompt += '\n\n## Previous Steps Output (Context)\n';
      for (const ctx of step_context) {
        systemPrompt += `\n### ${ctx.step_name}\n${ctx.step_output}\n`;
      }
    }

    if (Array.isArray(selected_knowledge_bases) && selected_knowledge_bases.length > 0) {
      systemPrompt += '\n\n## Selected Knowledge Bases\n';
      for (const knowledgeBase of selected_knowledge_bases) {
        systemPrompt += `\n- ${knowledgeBase.name || '未知知识库'}：${knowledgeBase.description || '无描述'}`;
      }
      systemPrompt += '\n';
    }

    if (Array.isArray(selected_review_materials) && selected_review_materials.length > 0) {
      systemPrompt += '\n\n## Selected Reviewed Materials\n';
      for (const material of selected_review_materials) {
        systemPrompt += `\n### ${material.name || '未命名材料'}\n来源：${material.source || 'unknown'}\n${material.summary || ''}\n`;
      }
    }

    if (Array.isArray(uploaded_files) && uploaded_files.length > 0) {
      systemPrompt += '\n\n## Uploaded Context Files\n';
      for (const file of uploaded_files) {
        systemPrompt += `\n### ${file.name || '未命名文件'}\n类型：${file.type || 'unknown'}；大小：${file.size || 0} bytes\n`;
        if (file.contentKind === 'text' && file.content) {
          systemPrompt += `${file.content}\n`;
        } else if (file.note) {
          systemPrompt += `${file.note}\n`;
        }
      }
    }

    systemPrompt += '\n\n## Instructions\n- Provide structured, professional output\n- If this is a methodology-driven skill, follow the methodology steps\n- Reference context from previous steps when relevant\n- Be thorough but concise\n- Use markdown formatting for better readability';

    const fullMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages,
    ];

    const stream = client.stream(fullMessages, {
      model: model_id || 'doubao-seed-2-0-pro-260215',
      temperature: 0.7,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(JSON.stringify({ error: 'Chat failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
