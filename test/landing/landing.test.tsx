import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LandingPage } from '@/components/landing/LandingPage';
import { Hero } from '@/components/landing/Hero/Hero';
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
import { getRoute } from '@/lib/router';
import { renderWithStore, resetRoute } from '../shared/fixtures';

describe('landing/landing — page composition', () => {
  beforeEach(() => resetRoute('/'));

  it('renders exactly one h1 with the positioning statement', () => {
    renderWithStore(<LandingPage />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(HERO.title);
  });

  it('renders the full section stack', () => {
    renderWithStore(<LandingPage />);

    expect(screen.getByRole('heading', { name: HOW_IT_WORKS.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: COMPARISON.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: PRIVACY.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions, answered.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: FINAL_CTA.title })).toBeInTheDocument();
  });

  it('renders every nav anchor with the right target', () => {
    renderWithStore(<LandingPage />);
    // The header and the footer both list the sections, so scope to the banner.
    const header = within(screen.getByRole('banner'));
    for (const link of NAV_LINKS) {
      expect(header.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href,
      );
    }
  });

  it('renders every how-it-works step as a numbered row', () => {
    renderWithStore(<LandingPage />);
    for (const step of HOW_IT_WORKS.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
      expect(screen.getByText(step.id)).toBeInTheDocument();
    }
    expect(screen.getByText(HOW_IT_WORKS.mechanismTail)).toBeInTheDocument();
  });

  it('renders the comparison table with a cell for every column', () => {
    renderWithStore(<LandingPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'AuraShare' })).toBeInTheDocument();
    for (const row of COMPARISON.rows) {
      expect(within(table).getByRole('rowheader', { name: row.label })).toBeInTheDocument();
      expect(within(table).getAllByText(row.values[0]!).length).toBeGreaterThan(0);
    }
  });

  it('renders every privacy guarantee', () => {
    renderWithStore(<LandingPage />);
    for (const point of PRIVACY.points) {
      expect(screen.getByText(point)).toBeInTheDocument();
    }
  });

  it('renders every FAQ question and the footer guarantee strip', () => {
    renderWithStore(<LandingPage />);
    for (const item of FAQS) {
      expect(screen.getByRole('button', { name: item.q })).toBeInTheDocument();
    }
    expect(screen.getByText(FOOTER.tagline)).toBeInTheDocument();
    for (const trust of FOOTER.trust) {
      expect(screen.getAllByText(trust).length).toBeGreaterThan(0);
    }
  });

  it('navigates to /app from the hero primary CTA', async () => {
    const user = userEvent.setup();
    renderWithStore(<LandingPage />);
    const heroCta = screen.getAllByRole('button', { name: /start sharing/i })[0]!;

    await user.click(heroCta);
    expect(getRoute()).toBe('/app');
  });

  it('navigates to /app from the final CTA', async () => {
    const user = userEvent.setup();
    renderWithStore(<LandingPage />);
    const cta = screen.getAllByRole('button', { name: /start sharing/i }).at(-1)!;

    await user.click(cta);
    expect(getRoute()).toBe('/app');
  });
});

describe('landing/landing — hero content', () => {
  beforeEach(() => resetRoute('/'));

  it('renders the subtitle and the three factual specs', () => {
    renderWithStore(<Hero />);
    expect(screen.getByText(HERO.subtitle)).toBeInTheDocument();
    for (const spec of HERO.specs) {
      expect(screen.getByText(spec.label)).toBeInTheDocument();
      expect(screen.getByText(spec.value)).toBeInTheDocument();
    }
  });

  it('points the hero secondary CTA at the how-it-works section', () => {
    renderWithStore(<Hero />);
    expect(screen.getByRole('link', { name: HERO.ctaSecondary })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
  });
});

describe('landing/landing — FAQ accordion', () => {
  it('opens the first item by default', () => {
    renderWithStore(<LandingPage />);
    expect(screen.getByRole('button', { name: FAQS[0]!.q })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps exactly one item open and reveals the selected answer', async () => {
    const user = userEvent.setup();
    renderWithStore(<LandingPage />);

    await user.click(screen.getByRole('button', { name: FAQS[1]!.q }));

    const buttons = FAQS.map((item) => screen.getByRole('button', { name: item.q }));
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true');
    expect(buttons.filter((button) => button.getAttribute('aria-expanded') === 'true')).toHaveLength(
      1,
    );

    const panelId = buttons[1]!.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel).toHaveAttribute('role', 'region');
    expect(within(panel as HTMLElement).getByText(FAQS[1]!.a)).toBeInTheDocument();
  });

  it('closes the open item when it is toggled again', async () => {
    const user = userEvent.setup();
    renderWithStore(<LandingPage />);
    const first = screen.getByRole('button', { name: FAQS[0]!.q });

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
  });
});
