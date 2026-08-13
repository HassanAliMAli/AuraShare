import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WHY_AURASHARE } from '../../../lib/landingCopy';
import { WhyAuraShare } from './WhyAuraShare';

describe('WhyAuraShare', () => {
  it('renders the three feature cards', () => {
    render(<WhyAuraShare />);
    for (const feature of WHY_AURASHARE.features) {
      expect(screen.getByRole('heading', { name: feature.title })).toBeInTheDocument();
      expect(screen.getByText(feature.description)).toBeInTheDocument();
    }
  });
});
