import { describe, expect, it } from 'vitest';
import {
  COMPARISON,
  FAQS,
  FINAL_CTA,
  FOOTER,
  HERO,
  HOW_IT_WORKS,
  NAV_LINKS,
  PRIVACY,
} from '@/lib/landingCopy';

describe('lib/landingCopy — content invariants', () => {
  it('has a single positioning headline and three factual specs', () => {
    expect(HERO.title).toContain('Send files between your devices');
    expect(HERO.subtitle).toContain('No account');
    expect(HERO.ctaPrimary).toBe('Start sharing');
    expect(HERO.specs).toHaveLength(3);
    expect(new Set(HERO.specs.map((spec) => spec.label)).size).toBe(3);
  });

  it('maps every nav link to a real section anchor', () => {
    const hrefs = NAV_LINKS.map((link) => link.href);
    expect(hrefs).toEqual(['#how-it-works', '#comparison', '#privacy', '#faq']);
  });

  it('defines three unique how-it-works steps and the mechanism strip', () => {
    expect(HOW_IT_WORKS.steps).toHaveLength(3);
    expect(new Set(HOW_IT_WORKS.steps.map((step) => step.id)).size).toBe(3);
    for (const step of HOW_IT_WORKS.steps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.description.length).toBeGreaterThan(10);
    }
    expect(HOW_IT_WORKS.mechanism).toHaveLength(3);
  });

  it('defines a comparison table where every row fills every column', () => {
    expect(COMPARISON.columns).toHaveLength(4);
    expect(COMPARISON.columns[0]).toBe('AuraShare');
    expect(COMPARISON.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of COMPARISON.rows) {
      expect(row.values).toHaveLength(COMPARISON.columns.length);
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it('keeps the privacy statement and four plain guarantees', () => {
    expect(PRIVACY.title).toContain('never touch a server');
    expect(PRIVACY.points).toHaveLength(4);
    expect(PRIVACY.caption).toContain('handshake');
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

  it('states the footer guarantees once', () => {
    expect(FOOTER.trust).toHaveLength(3);
    expect(FOOTER.tagline.length).toBeGreaterThan(0);
  });
});
