const TUNING_BLOCK_PATTERNS = [
  /\n*\s*(?:【|\[)工作流调优要求(?:】|\])[\s\S]*$/i,
  /\n*\s*##\s*工作流调优要求[\s\S]*$/i,
  /\n*\s*(?:【|\[)BattleFlow\s*工作流调优要求(?:】|\])[\s\S]*$/i,
  /\n*\s*##\s*BattleFlow\s*工作流调优要求[\s\S]*$/i,
];

const TUNING_VALIDATION_LINE_PATTERN = /^\s*请基于当前工作流上下文验证此调优草稿.*$/gm;

export function cleanExecutableSkillText(value: string | undefined, fallback = '', tuningRequest = '') {
  let cleaned = (value || '').trim();

  for (const pattern of TUNING_BLOCK_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  cleaned = cleaned.replace(TUNING_VALIDATION_LINE_PATTERN, '').trim();

  const request = tuningRequest.trim();
  if (request) {
    cleaned = cleaned.split(request).join('').trim();
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || fallback;
}
