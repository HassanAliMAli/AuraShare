import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getRoute, navigate } from '../../../lib/router';
import { HERO } from '../../../lib/landingCopy';
import { Hero } from './Hero';

describe('Hero', () => {
  beforeEach(() => {
    if (getRoute() !== '/') navigate('/');
  });

  it('renders the positioning headline as the single h1', () => {
    render(<Hero />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(HERO.title);
  });

  it('renders subtitle and trust strip', () => {
    render(<Hero />);
    expect(screen.getByText(HERO.subtitle)).toBeInTheDocument();
    for (const item of HERO.trust) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });

  it('renders the secondary CTA pointing at how-it-works', () => {
    render(<Hero />);
    expect(screen.getByRole('link', { name: HERO.ctaSecondary })).toHaveAttribute(
      'href',
      '#how-it-works'
    );
  });

  it('navigates to /app from the primary CTA', async () => {
    const user = userEvent.setup();
    render(<Hero />);
    await user.click(screen.getByRole('button', { name: /start sharing/i }));
    expect(getRoute()).toBe('/app');
  });
});
