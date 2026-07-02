const SUPPORTED_CLAUDE_TOOLS = new Map([
  ['websearch', 'WebSearch'],
  ['webfetch', 'WebFetch'],
]);

export function getConfiguredClaudeTools(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.BATTLEFLOW_CLAUDE_TOOLS || '';
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const item of raw.split(/[,\s]+/)) {
    const key = item.trim().toLowerCase();
    if (!key) continue;
    const canonical = SUPPORTED_CLAUDE_TOOLS.get(key);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    selected.push(canonical);
  }

  return selected;
}

export function getConfiguredClaudeToolsArg(env: NodeJS.ProcessEnv = process.env) {
  return getConfiguredClaudeTools(env).join(',');
}

export function buildClaudeToolsArgs(env: NodeJS.ProcessEnv = process.env) {
  const tools = getConfiguredClaudeToolsArg(env);
  return tools
    ? ['--tools', tools, '--allowedTools', tools]
    : ['--tools', ''];
}
