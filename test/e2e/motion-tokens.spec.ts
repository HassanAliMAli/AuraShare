import { expect, test } from '@playwright/test';

/**
 * The design system's motion tokens must actually reach the browser.
 *
 * Tailwind v4 ignores the v3 way of pointing a utility at a CSS variable.
 * `duration-[--duration-micro]` compiles to a literal token name, which is
 * not a `<time>`, so the declaration is dropped and the transition runs
 * with no duration at all. The tokens in `styles/tokens.css` were therefore
 * never applied: hover colours snapped instead of fading, and the FAQ
 * accordion opened without animating.
 *
 * These assertions read the computed style, so they fail on the broken
 * syntax and pass on the fixed one.
 */

const APP_URL = '/app';
const LANDING_URL = '/';

test.describe('motion tokens', () => {
  test.beforeEach(async ({ page }) => {
    // The stylesheet honours `prefers-reduced-motion` by flattening every
    // transition to 0.01ms. The tokens have to be measured with the
    // preference off, or the assertion measures the reduced-motion rule.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('a button fades over the micro duration', async ({ page }) => {
    await page.goto(APP_URL);

    const button = page.getByRole('button', { name: 'Send text' });
    await expect(button).toBeVisible();

    const duration = await button.evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );

    // `--duration-micro: 120ms`
    expect(duration).toBe('0.12s');
  });

  test('the FAQ answer opens over the standard duration and easing', async ({ page }) => {
    await page.goto(LANDING_URL);

    const panel = page.locator('[role="region"]').first();
    await expect(panel).toBeAttached();

    const styles = await panel.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        duration: computed.transitionDuration,
        easing: computed.transitionTimingFunction,
      };
    });

    // `--duration-standard: 200ms` and `--ease-standard`.
    expect(styles.duration).toBe('0.2s');
    expect(styles.easing).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  test('the FAQ chevron turns over the standard duration', async ({ page }) => {
    await page.goto(LANDING_URL);

    const chevron = page.locator('[aria-controls^="faq-panel-"] svg').first();
    await expect(chevron).toBeVisible();

    const duration = await chevron.evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );

    expect(duration).toBe('0.2s');
  });
});
