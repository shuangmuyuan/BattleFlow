import { describe, expect, it, vi } from 'vitest';
import {
  assertSkillPackageSpec,
  renderStandardSkillTemplateMarkdown,
  validateSkillPackageSpec,
} from './skill-registry';

vi.mock('@/storage/database/postgres-client', () => ({
  hasPostgresDatabaseConfig: () => false,
  queryPostgres: vi.fn(),
}));

const validContract = {
  acceptanceCriteria: ['The artifact covers every required section.'],
  requiredSections: ['Context', 'Analysis', 'Recommendation'],
  evidenceRules: ['Mark unsupported claims as assumptions.'],
  failureConditions: ['Missing required sections.'],
};

describe('skill package specification validation', () => {
  it('accepts a package that satisfies the BattleFlow Skill specification', () => {
    const skillMd = renderStandardSkillTemplateMarkdown();

    expect(validateSkillPackageSpec({
      skillMd,
      name: 'Example Product Planning Skill',
      description: 'A reusable product planning method.',
      version: '1.0.0',
      methodology: '1. Clarify context\n2. Produce artifact',
      outputs: { format: 'structured_markdown' },
      checklist: ['Output is standalone.'],
      validationContract: validContract,
      contentMd: skillMd,
    })).toEqual([]);
  });

  it('reports concrete missing fields for an invalid package', () => {
    const issues = validateSkillPackageSpec({
      skillMd: '',
      name: '',
      description: '',
      version: 'latest',
      methodology: '',
      outputs: {},
      checklist: [],
      validationContract: {},
      contentMd: '',
    });

    expect(issues).toEqual(expect.arrayContaining([
      'SKILL.md or skill.md is required.',
      'Skill name is required in frontmatter or meta.json.',
      'Skill description is required in frontmatter, meta.json, or the Description section.',
      'Skill version must be semantic versioning, received "latest".',
      'Methodology or process section is required.',
      'Outputs definition or output section is required.',
      'Checklist or acceptance criteria are required.',
      'Validation contract must include acceptanceCriteria.',
      'Validation contract must include requiredSections.',
      'Validation contract must include evidenceRules.',
      'Validation contract must include failureConditions.',
    ]));
  });

  it('skips import blocking while package specification enforcement is disabled', () => {
    expect(() => assertSkillPackageSpec({
      packagePath: '/tmp/bad-skill',
      skillMd: '',
      version: '',
      outputs: {},
      checklist: [],
      validationContract: {},
      contentMd: '',
    })).not.toThrow();
  });
});
