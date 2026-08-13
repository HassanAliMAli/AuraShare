import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HOW_IT_WORKS } from '../../../lib/landingCopy';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('renders the three device-pair step cards', () => {
    render(<HowItWorks />);
    for (const step of HOW_IT_WORKS.steps) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
    }
  });

  it('renders the mechanism strip', () => {
    render(<HowItWorks />);
    expect(screen.getByText(HOW_IT_WORKS.mechanismTail)).toBeInTheDocument();
  });
});
