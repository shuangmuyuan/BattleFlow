import OpenCC from 'opencc-js';

const traditionalToSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

const markdownCodePattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const inlineCodePattern = /(`[^`\n]*`)/g;
const likelyTraditionalChinesePattern = /[體臺灣國學會議點門題風險輸齣與專業個們優勢應該進選擇標準數據資庫檔案轉換後續當對話歷驗證產結構關鍵發議問補說]/;

export const SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION = [
  '除非用户在本轮明确要求其他语言，所有面向用户的 AI 生成内容必须使用简体中文。',
  '即使上下文、知识库、上传文件或历史消息包含繁体中文，解释、总结、标题、Markdown 文档和 JSON 字符串字段值也必须使用简体中文。',
  '引用外部原文时可以保留原文；引用之外的分析、归纳和说明必须使用简体中文。',
].join('\n');

function convertInlineCodeAware(value: string) {
  return value
    .split(inlineCodePattern)
    .map((part) => (part.startsWith('`') && part.endsWith('`') ? part : traditionalToSimplified(part)))
    .join('');
}

export function toSimplifiedChinese(value: string): string {
  if (!value) return value;

  return value
    .split(markdownCodePattern)
    .map((part) => {
      if (
        (part.startsWith('```') && part.endsWith('```'))
        || (part.startsWith('~~~') && part.endsWith('~~~'))
      ) {
        return part;
      }
      return convertInlineCodeAware(part);
    })
    .join('');
}

export function toSimplifiedChineseDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return toSimplifiedChinese(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSimplifiedChineseDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toSimplifiedChineseDeep(item)]),
    ) as T;
  }
  return value;
}

export function containsLikelyTraditionalChinese(value: string): boolean {
  return likelyTraditionalChinesePattern.test(value);
}

export function warnIfLikelyTraditionalChinese(
  surface: string,
  value: string,
  logger: Pick<Console, 'warn'> = console,
) {
  if (!containsLikelyTraditionalChinese(value)) return;

  logger.warn(`[BattleFlow] ${surface} still contains likely Traditional Chinese after simplification.`);
}

export function normalizeAiGeneratedText(
  surface: string,
  value: string,
  logger: Pick<Console, 'warn'> = console,
): string {
  const simplified = toSimplifiedChinese(value);
  warnIfLikelyTraditionalChinese(surface, simplified, logger);
  return simplified;
}
