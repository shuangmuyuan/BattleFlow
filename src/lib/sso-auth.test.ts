import { describe, expect, it } from 'vitest';
import { createSsoState, normalizeIdTrustUser, verifySsoState } from './sso-auth';

const productionRawProfile = {
  dept: '/深信服科技/研发体系/DSP&ZTP产品研发部/资产可视团队',
  desc: '',
  name: '94399',
  email: '94399@sangfor.com',
  sub_account: '94399',
  display_name: '李春鹤',
} satisfies Record<string, unknown>;

describe('IDTrust SSO user normalization', () => {
  it('maps the production raw profile fields to BattleFlow user fields', () => {
    const profile = normalizeIdTrustUser(productionRawProfile);

    expect(profile).toMatchObject({
      ssoId: '94399',
      username: '94399',
      displayName: '李春鹤',
      email: '94399@sangfor.com',
      department: '/深信服科技/研发体系/DSP&ZTP产品研发部/资产可视团队',
      departmentId: '',
      title: '',
      mobile: '',
    });
    expect(profile.rawProfile).toEqual(productionRawProfile);
  });

  it('reads profile data from a raw_profile wrapper when providers return one', () => {
    const profile = normalizeIdTrustUser({
      raw_profile: productionRawProfile,
      email: 'outer@example.com',
    });

    expect(profile).toMatchObject({
      ssoId: '94399',
      username: '94399',
      displayName: '李春鹤',
      email: '94399@sangfor.com',
      department: '/深信服科技/研发体系/DSP&ZTP产品研发部/资产可视团队',
    });
    expect(profile.rawProfile).toEqual(productionRawProfile);
  });

  it('prefers sub_account over name for stable SSO identity and username', () => {
    const profile = normalizeIdTrustUser({
      sub_account: '94399',
      name: 'legacy-name',
      email: '94399@sangfor.com',
    });

    expect(profile.ssoId).toBe('94399');
    expect(profile.username).toBe('94399');
    expect(profile.displayName).toBe('legacy-name');
  });
});

describe('IDTrust SSO state', () => {
  it('round-trips the callback URI and post-login redirect target', () => {
    const state = createSsoState('https://battleflow.example/auth/callback', '/dashboard/demos');
    const payload = verifySsoState(state);

    expect(payload).toMatchObject({
      redirectUri: 'https://battleflow.example/auth/callback',
      nextPath: '/dashboard/demos',
    });
  });
});
