import { describe, it, expect } from 'vitest';
import { HERO, HOW_IT_WORKS, WHY_AURASHARE, PRIVACY, FAQS, FINAL_CTA, FOOTER } from './landingCopy';

describe('landingCopy', () => {
  it('hero carries the positioning message and CTAs', () => {
    expect(HERO.title).toContain('devices');
    expect(HERO.subtitle).toContain('No account');
    expect(HERO.ctaPrimary).toBe('Start Sharing');
    expect(HERO.trust).toHaveLength(3);
  });

  it('how-it-works has exactly 3 device-pair steps with ids', () => {
    expect(HOW_IT_WORKS.steps).toHaveLength(3);
    const ids = new Set(HOW_IT_WORKS.steps.map((s) => s.id));
    expect(ids.size).toBe(3);
    for (const step of HOW_IT_WORKS.steps) {
      expect(step.title).toContain('→');
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it('why-aurashare has 3 features', () => {
    expect(WHY_AURASHARE.features).toHaveLength(3);
    for (const f of WHY_AURASHARE.features) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it('privacy has the money-line headline and 5 chips', () => {
    expect(PRIVACY.title).toContain("don't need an account");
    expect(PRIVACY.chips).toHaveLength(5);
  });

  it('faq has 6 unique ids', () => {
    expect(FAQS).toHaveLength(6);
    const ids = new Set(FAQS.map((f) => f.id));
    expect(ids.size).toBe(6);
  });

  it('final CTA and footer are non-empty', () => {
    expect(FINAL_CTA.title.length).toBeGreaterThan(0);
    expect(FINAL_CTA.cta).toBe('Start Sharing');
    expect(FOOTER.trust).toHaveLength(3);
  });
});
