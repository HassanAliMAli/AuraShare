import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PRIVACY } from '../../../lib/landingCopy';
import { PrivacySection } from './PrivacySection';

describe('PrivacySection', () => {
  it('renders the money-line headline', () => {
    render(<PrivacySection />);
    expect(screen.getByRole('heading', { name: PRIVACY.title })).toBeInTheDocument();
  });

  it('renders all trust chips', () => {
    render(<PrivacySection />);
    for (const chip of PRIVACY.chips) {
      expect(screen.getByText(chip)).toBeInTheDocument();
    }
  });

  it('labels the direct P2P path', () => {
    render(<PrivacySection />);
    expect(screen.getByText(PRIVACY.directLabel)).toBeInTheDocument();
    expect(screen.getByText(PRIVACY.relayLabel)).toBeInTheDocument();
  });
});
