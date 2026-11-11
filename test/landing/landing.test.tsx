import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LandingPage } from '@/components/landing/LandingPage';
import { DeviceFlowVisual } from '@/components/landing/DeviceFlowVisual/DeviceFlowVisual';
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
import { getRoute, navigate } from '@/lib/router';
import { renderWithStore, resetRoute } from '../shared/fixtures';

describe('landing/landing — page composition', () => {
  beforeEach(() => resetRoute('/'));

  it('renders exactly one h1 with the hero positioning statement', () => {
    renderWithStore(<LandingPage />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(HERO.title);
  });

  it('renders the full section stack', () => {
    renderWithStore(<LandingPage />);

    expect(screen.getByRole('heading', { name: HOW_IT_WORKS.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: WHY_AURASHARE.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: PRIVACY.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions, answered.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: FINAL_CTA.title })).toBeInTheDocument();
  });

  it('renders every nav anchor with the right target', () => {
    renderWithStore(<LandingPage />);
    for (const link of NAV_LINKS) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href,
      );
    }
  });

  it('renders the three step cards, feature cards, and privacy chips', () => {
    renderWithStore(<LandingPage />);
    for (const step of HOW_IT_WORKS.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
    }
    for (const feature of WHY_AURASHARE.features) {
      expect(screen.getByRole('heading', { name: feature.title })).toBeInTheDocument();
    }
    for (const chip of PRIVACY.chips) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it('renders every FAQ question and the footer trust strip', () => {
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
    const cta = screen
      .getAllByRole('button', { name: /start sharing/i })
      .at(-1)!;

    await user.click(cta);
    expect(getRoute()).toBe('/app');
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

describe('landing/landing — DeviceFlowVisual', () => {
  it('is decorative and exposes no interactive content', () => {
    const { container } = renderWithStore(<DeviceFlowVisual />);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(within(container).queryByRole('button')).not.toBeInTheDocument();
    expect(within(container).queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the file packet and the pairing code', () => {
    renderWithStore(<DeviceFlowVisual />);
    expect(screen.getAllByText(/video\.mp4/).length).toBeGreaterThan(0);
    expect(screen.getByText('A1B2C3')).toBeInTheDocument();
  });
});

void navigate;
