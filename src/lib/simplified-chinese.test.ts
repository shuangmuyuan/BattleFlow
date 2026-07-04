import { describe, expect, it, vi } from 'vitest';
import {
  containsLikelyTraditionalChinese,
  normalizeAiGeneratedText,
  toSimplifiedChinese,
  toSimplifiedChineseDeep,
} from './simplified-chinese';

describe('simplified Chinese output helpers', () => {
  it('converts common Traditional Chinese text to Simplified Chinese', () => {
    expect(toSimplifiedChinese('這是一份產品規劃報告，包含關鍵假設與風險。')).toBe(
      '这是一份产品规划报告，包含关键假设与风险。',
    );
  });

  it('keeps Simplified Chinese and non-Chinese text stable', () => {
    expect(toSimplifiedChinese('这是一份 PRD v1.0 report.')).toBe('这是一份 PRD v1.0 report.');
  });

  it('converts prose in Markdown without rewriting code spans or fenced code', () => {
    const input = [
      '# 產品規劃',
      '',
      '請檢查 `用戶資料` 欄位。',
      '',
      '```ts',
      'const label = "用戶資料";',
      '```',
    ].join('\n');

    expect(toSimplifiedChinese(input)).toBe([
      '# 产品规划',
      '',
      '请检查 `用戶資料` 栏位。',
      '',
      '```ts',
      'const label = "用戶資料";',
      '```',
    ].join('\n'));
  });

  it('converts nested generated string values without changing object keys', () => {
    expect(toSimplifiedChineseDeep({
      summary: '需要補充風險。',
      findings: [{ issue: '證據不足。' }],
    })).toEqual({
      summary: '需要补充风险。',
      findings: [{ issue: '证据不足。' }],
    });
  });

  it('detects likely Traditional Chinese after normalization', () => {
    const logger = { warn: vi.fn() };

    expect(normalizeAiGeneratedText('test', '繁體殘留：體', logger)).toContain('体');
    expect(logger.warn).not.toHaveBeenCalled();

    expect(containsLikelyTraditionalChinese('體')).toBe(true);
  });

  it('keeps empty text empty', () => {
    expect(toSimplifiedChinese('')).toBe('');
  });
});
