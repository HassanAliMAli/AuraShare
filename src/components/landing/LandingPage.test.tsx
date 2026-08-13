import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingPage } from './LandingPage';
import { HERO, HOW_IT_WORKS, PRIVACY, FAQS, FINAL_CTA } from '../../lib/landingCopy';

describe('LandingPage', () => {
  it('composes every section of the marketing page', () => {
    render(<LandingPage />);

    // One h1 from the hero.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HERO.title);

    // How it works cards.
    for (const step of HOW_IT_WORKS.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
    }

    // Privacy money-line.
    expect(screen.getByRole('heading', { name: PRIVACY.title })).toBeInTheDocument();

    // FAQ questions.
    for (const item of FAQS) {
      expect(screen.getByRole('button', { name: item.q })).toBeInTheDocument();
    }

    // Final CTA.
    expect(screen.getByRole('heading', { name: FINAL_CTA.title })).toBeInTheDocument();
  });
});
