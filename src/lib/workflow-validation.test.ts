import { describe, expect, it } from 'vitest';
import {
  aggregateValidationStatus,
  buildValidationCriteria,
  parseValidationResult,
  resolveValidationGateResult,
  type ParsedWorkflowValidationResult,
} from './workflow-validation';
import type { WorkflowStepValidationPhaseRecord } from './workflow-registry';

const baseSkill = {
  name: 'Validation Skill',
  description: 'Checks structured planning output.',
  outputs: {
    format: 'structured_markdown',
    sections: ['结论', '风险'],
  },
  checklist: ['Checklist criterion'],
  skill_md: '# Validation Skill',
  meta_json: {
    validationContract: {
      acceptanceCriteria: ['Meta acceptance criterion'],
      requiredSections: ['证据'],
      evidenceRules: ['Evidence must reference source material.'],
      failureConditions: ['Missing risks section.'],
    },
  },
  acceptanceCriteria: ['Direct acceptance criterion'],
  requiredSections: ['结论'],
  evidenceRules: ['Direct evidence rule'],
  failureConditions: ['Direct failure condition'],
};

function phase(result: ParsedWorkflowValidationResult): WorkflowStepValidationPhaseRecord {
  return {
    outcome: result.outcome,
    summary: result.summary,
    findings: result.findings,
  };
}

describe('workflow validation core logic', () => {
  it('builds validation criteria from explicit contracts, draft gates, outputs, and checklist', () => {
    const criteria = buildValidationCriteria(baseSkill, {
      quality_gates: ['Draft quality gate'],
      checklist: ['Draft checklist criterion'],
      outputs: {
        format: 'markdown',
        sections: ['方案'],
      },
      skill_md: '# Draft',
      validation_note: 'Draft validation note',
      acceptanceCriteria: ['Draft acceptance criterion'],
      requiredSections: ['风险'],
      evidenceRules: ['Draft evidence rule'],
      failureConditions: ['Draft failure condition'],
    });

    expect(criteria).toEqual(expect.arrayContaining([
      'Direct acceptance criterion',
      'Meta acceptance criterion',
      '产物必须包含「结论」章节。',
      '产物必须包含「证据」章节。',
      'Direct evidence rule',
      '若出现以下情况必须判定为未通过：Direct failure condition',
      'Draft acceptance criterion',
      '产物必须包含「风险」章节。',
      'Draft quality gate',
      'Draft checklist criterion',
      '产物输出格式必须符合 Skill 声明的 markdown。',
      '产物必须覆盖 Skill 声明的输出章节：方案。',
    ]));
  });

  it('parses strict validation JSON and rejects prose-wrapped output', () => {
    const parsed = parseValidationResult(JSON.stringify({
      outcome: 'needs_revision',
      summary: 'Needs concrete evidence.',
      findings: [
        {
          severity: 'blocking',
          criterion: 'Evidence must reference source material.',
          issue: 'No evidence is cited.',
          recommendation: 'Add evidence for the trend.',
          evidence: 'Trend claim',
        },
      ],
    }));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.result.outcome).toBe('needs_revision');
      expect(parsed.result.findings[0].severity).toBe('blocking');
    }

    const prose = parseValidationResult('Result:\n{"outcome":"pass","summary":"ok","findings":[]}');
    expect(prose.ok).toBe(false);
  });

  it('aggregates self-check and agent validation outcomes', () => {
    expect(aggregateValidationStatus({ outcome: 'pass' }, { outcome: 'pass' })).toBe('passed');
    expect(aggregateValidationStatus({ outcome: 'pass' }, { outcome: 'needs_revision' })).toBe('failed');
    expect(aggregateValidationStatus({ outcome: 'error' }, { outcome: 'pass' })).toBe('error');
    expect(aggregateValidationStatus({ outcome: 'pass' })).toBe('running');
  });

  it('keeps failed candidates out of completed workflow output promotion', () => {
    const selfCheck = phase({
      outcome: 'pass',
      summary: 'Self-check passed.',
      findings: [],
    });
    const agentValidation = phase({
      outcome: 'needs_revision',
      summary: 'The candidate is missing evidence.',
      findings: [
        {
          id: 'missing-evidence',
          severity: 'blocking',
          criterion: 'Evidence must reference source material.',
          issue: 'No source-backed evidence appears in the candidate.',
          recommendation: 'Add cited evidence before completing the step.',
        },
      ],
    });

    const result = resolveValidationGateResult(selfCheck, agentValidation);

    expect(result.attemptStatus).toBe('failed');
    expect(result.stepStatus).toBe('validation_failed');
    expect(result.validationStatus).toBe('failed');
    expect(result.shouldPromoteCandidate).toBe(false);
    expect(result.summary).toBe('The candidate is missing evidence.');
  });
});
