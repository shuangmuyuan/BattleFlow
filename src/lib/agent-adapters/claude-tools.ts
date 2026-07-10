const SUPPORTED_CLAUDE_TOOLS = new Map([
  ['read', 'Read'],
  ['grep', 'Grep'],
  ['glob', 'Glob'],
  ['websearch', 'WebSearch'],
  ['webfetch', 'WebFetch'],
  ['write', 'Write'],
  ['edit', 'Edit'],
]);

export function normalizeClaudeTools(values: Iterable<string>) {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const item of values) {
    const key = item.trim().toLowerCase();
    if (!key) continue;
    const canonical = SUPPORTED_CLAUDE_TOOLS.get(key);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    selected.push(canonical);
  }

  return selected;
}

export function getConfiguredClaudeTools(env: NodeJS.ProcessEnv = process.env) {
  return normalizeClaudeTools((env.BATTLEFLOW_CLAUDE_TOOLS || '').split(/[,\s]+/));
}
