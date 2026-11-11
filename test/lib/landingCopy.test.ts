import { describe, expect, it } from 'vitest';
import {
  FAQS,
  FINAL_CTA,
  FOOTER,
  HERO,
  HOW_IT_WORKS,
  NAV_LINKS,
  PRIVACY,
  WHY_AURASHARE,
} from '@/lib/landingCopy';

describe('lib/landingCopy — content invariants', () => {
  it('has a single positioning headline and three trust badges', () => {
    expect(HERO.title).toContain('Send files between your devices');
    expect(HERO.subtitle).toContain('No account');
    expect(HERO.ctaPrimary).toBe('Start Sharing');
    expect(HERO.trust).toHaveLength(3);
    expect(HERO.trust).toEqual(FOOTER.trust);
  });

  it('maps every nav link to a real section anchor', () => {
    const hrefs = NAV_LINKS.map((link) => link.href);
    expect(hrefs).toEqual(['#how-it-works', '#why-aurashare', '#privacy', '#faq']);
  });

  it('defines three unique how-it-works steps and the mechanism strip', () => {
    expect(HOW_IT_WORKS.steps).toHaveLength(3);
    expect(new Set(HOW_IT_WORKS.steps.map((step) => step.id)).size).toBe(3);
    for (const step of HOW_IT_WORKS.steps) {
      expect(step.title).toContain('→');
      expect(step.description.length).toBeGreaterThan(10);
    }
    expect(HOW_IT_WORKS.mechanism).toHaveLength(3);
  });

  it('defines three differentiated feature cards', () => {
    expect(WHY_AURASHARE.features).toHaveLength(3);
    expect(new Set(WHY_AURASHARE.features.map((feature) => feature.icon)).size).toBe(3);
    for (const feature of WHY_AURASHARE.features) {
      expect(feature.title.length).toBeGreaterThan(0);
      expect(feature.description.length).toBeGreaterThan(20);
    }
  });

  it('keeps the privacy money-line and five trust chips', () => {
    expect(PRIVACY.title).toContain("don't need an account");
    expect(PRIVACY.chips).toHaveLength(5);
    expect(PRIVACY.caption).toContain('peer-to-peer');
  });

  it('has six FAQ entries with unique ids and non-empty answers', () => {
    expect(FAQS).toHaveLength(6);
    expect(new Set(FAQS.map((item) => item.id)).size).toBe(6);
    for (const item of FAQS) {
      expect(item.q.length).toBeGreaterThan(0);
      expect(item.a.length).toBeGreaterThan(20);
    }
  });

  it('closes with the same primary CTA as the hero and nav', () => {
    expect(FINAL_CTA.cta).toBe(HERO.ctaPrimary);
    expect(FINAL_CTA.title.length).toBeGreaterThan(0);
  });
});
