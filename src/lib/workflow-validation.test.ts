import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  aggregateValidationStatus,
  buildValidationCriteria,
  parseValidationResult,
  resolveValidationGateResult,
  shouldRunWorkflowStepAgentValidation,
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

    for (const expected of [
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
    ]) {
      assert.ok(criteria.includes(expected), `Expected validation criteria to include: ${expected}`);
    }
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

    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.result.outcome, 'needs_revision');
      assert.equal(parsed.result.findings[0].severity, 'blocking');
    }

    const prose = parseValidationResult('Result:\n{"outcome":"pass","summary":"ok","findings":[]}');
    assert.equal(prose.ok, false);
  });

  it('aggregates self-check and agent validation outcomes', () => {
    assert.equal(aggregateValidationStatus({ outcome: 'pass' }, { outcome: 'pass' }), 'passed');
    assert.equal(aggregateValidationStatus({ outcome: 'pass' }, { outcome: 'needs_revision' }), 'failed');
    assert.equal(aggregateValidationStatus({ outcome: 'error' }, { outcome: 'pass' }), 'error');
    assert.equal(aggregateValidationStatus({ outcome: 'pass' }), 'running');
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

    assert.equal(result.attemptStatus, 'failed');
    assert.equal(result.stepStatus, 'validation_failed');
    assert.equal(result.validationStatus, 'failed');
    assert.equal(result.shouldPromoteCandidate, false);
    assert.equal(result.summary, 'The candidate is missing evidence.');
  });

  it('allows self-check-only validation when agent validation is disabled', () => {
    assert.equal(shouldRunWorkflowStepAgentValidation(false), false);
    assert.equal(shouldRunWorkflowStepAgentValidation(true), true);

    const passedSelfCheck = phase({
      outcome: 'pass',
      summary: 'Self-check passed.',
      findings: [],
    });
    const passedResult = resolveValidationGateResult(passedSelfCheck, undefined, {
      requireAgentValidation: shouldRunWorkflowStepAgentValidation(false),
    });

    assert.equal(passedResult.attemptStatus, 'passed');
    assert.equal(passedResult.stepStatus, 'completed');
    assert.equal(passedResult.validationStatus, 'passed');
    assert.equal(passedResult.shouldPromoteCandidate, true);

    const failedSelfCheck = phase({
      outcome: 'needs_revision',
      summary: 'Self-check found missing scope.',
      findings: [],
    });
    const failedResult = resolveValidationGateResult(failedSelfCheck, undefined, {
      requireAgentValidation: shouldRunWorkflowStepAgentValidation(false),
    });

    assert.equal(failedResult.attemptStatus, 'failed');
    assert.equal(failedResult.stepStatus, 'validation_failed');
    assert.equal(failedResult.validationStatus, 'failed');
    assert.equal(failedResult.shouldPromoteCandidate, false);
  });
});
