import { ToolCallRenderer } from '@/components/battleflow/tool-calls/tool-call-renderer';

const completedStatus = { type: 'complete' as const };

const mockToolCalls = [
  {
    label: 'Read with line numbers',
    props: {
      toolCallId: 'preview-read',
      toolName: 'Read',
      args: {
        file_path: 'src/app/dashboard/workflows/page.tsx',
        start_line: 120,
        end_line: 132,
      },
      result: [
        '120|function mergeChatToolCall(toolCalls: ChatToolCall[], nextToolCall: ChatToolCall) {',
        '121|  const existingIndex = toolCalls.findIndex((toolCall) => toolCall.id === nextToolCall.id);',
        '122|  if (existingIndex < 0) return [...toolCalls, nextToolCall].slice(-50);',
        '123|',
        '124|  return toolCalls.map((toolCall, index) => (',
        '125|    index === existingIndex ? { ...toolCall, ...nextToolCall } : toolCall',
        '126|  ));',
        '127|}',
      ].join('\n'),
      status: completedStatus,
      artifact: {
        status: 'completed',
        startedAt: '2026-07-06T01:00:00.000Z',
        completedAt: '2026-07-06T01:00:01.320Z',
      },
    },
  },
  {
    label: 'Grep string output',
    props: {
      toolCallId: 'preview-grep',
      toolName: 'grep',
      args: {
        pattern: 'ToolCallRenderer',
        path: 'src/components',
        output_mode: 'content',
      },
      result: [
        'src/components/battleflow/workflow-assistant-thread.tsx:29:import { ToolCallRenderer } from "@/components/battleflow/tool-calls/tool-call-renderer";',
        'src/components/battleflow/workflow-assistant-thread.tsx:536:                  <ToolCallRenderer {...part} />',
      ].join('\n'),
      status: completedStatus,
      artifact: {
        status: 'completed',
        startedAt: '2026-07-06T01:02:00.000Z',
        completedAt: '2026-07-06T01:02:00.950Z',
      },
    },
  },
  {
    label: 'Glob array output',
    props: {
      toolCallId: 'preview-glob',
      toolName: 'Glob',
      args: {
        pattern: 'src/components/**/*.tsx',
        cwd: '/Users/lichunhe/Documents/Playground/BattleFlow-agent-tool-call-ui',
      },
      result: [
        'src/components/battleflow/tool-calls/tool-call-renderer.tsx',
        'src/components/battleflow/tool-calls/tool-call-utils.ts',
        'src/components/battleflow/workflow-assistant-thread.tsx',
        'src/components/ui/button.tsx',
        'src/components/ui/collapsible.tsx',
        'src/components/ui/tooltip.tsx',
      ],
      status: completedStatus,
      artifact: {
        status: 'completed',
        startedAt: '2026-07-06T01:03:00.000Z',
        completedAt: '2026-07-06T01:03:00.420Z',
      },
    },
  },
  {
    label: 'WebSearch object results',
    props: {
      toolCallId: 'preview-web-search',
      toolName: 'WebSearch',
      args: {
        query: 'assistant-ui tool call rendering',
        allowed_domains: ['assistant-ui.com'],
        max_results: 3,
      },
      result: {
        results: [
          {
            title: 'Tool UI',
            url: 'https://www.assistant-ui.com/docs/tool-ui',
            snippet: 'Render custom UI for backend and frontend tool calls.',
          },
          {
            title: 'Registry Tool Fallback',
            url: 'https://www.assistant-ui.com/docs/registry-components',
            snippet: 'Prebuilt fallback renderer for tool-call message parts.',
          },
        ],
      },
      status: completedStatus,
      artifact: {
        status: 'completed',
        startedAt: '2026-07-06T01:04:00.000Z',
        completedAt: '2026-07-06T01:04:02.000Z',
      },
    },
  },
  {
    label: 'WebFetch markdown output',
    props: {
      toolCallId: 'preview-web-fetch',
      toolName: 'web_fetch',
      args: {
        url: 'https://www.assistant-ui.com/',
        prompt: 'Summarize the tool rendering API.',
      },
      result: {
        title: 'assistant-ui',
        status_code: 200,
        markdown: [
          '## Tool rendering',
          '',
          'assistant-ui renders tool calls as structured message parts. Custom renderers receive the tool name, args, result, and status.',
          '',
          '- `running` for active calls',
          '- `complete` for successful calls',
        ].join('\n'),
      },
      status: completedStatus,
      artifact: {
        status: 'completed',
        startedAt: '2026-07-06T01:05:00.000Z',
        completedAt: '2026-07-06T01:05:03.480Z',
      },
    },
  },
  {
    label: 'WebFetch error state',
    props: {
      toolCallId: 'preview-web-fetch-error',
      toolName: 'WebFetch',
      args: {
        url: 'https://example.invalid/resource',
      },
      result: 'Fetch failed: DNS lookup failed',
      isError: true,
      status: { type: 'incomplete' as const, reason: 'error' as const },
      artifact: {
        status: 'failed',
        startedAt: '2026-07-06T01:07:00.000Z',
        completedAt: '2026-07-06T01:07:01.000Z',
      },
    },
  },
  {
    label: 'Generic empty output',
    props: {
      toolCallId: 'preview-empty',
      toolName: 'UnknownTool',
      args: {
        raw: 'value',
      },
      result: '',
      status: completedStatus,
      artifact: {
        status: 'completed',
        startedAt: '2026-07-06T01:08:00.000Z',
        completedAt: '2026-07-06T01:08:00.100Z',
      },
    },
  },
];

export default function ToolCallsPreviewPage() {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background p-4 md:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="rounded-lg border border-border/60 bg-card/80 p-4 shadow-sm shadow-foreground/5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Agent Tool Call Preview
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mock tool-call cards for Read, Grep, Glob, WebSearch, WebFetch, error, empty,
            string, object, and array outputs.
          </p>
        </div>
        <div className="grid gap-4">
          {mockToolCalls.map((item) => (
            <section key={item.props.toolCallId} className="space-y-2">
              <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {item.label}
              </h2>
              <ToolCallRenderer {...item.props} />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
