import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getRoute, navigate } from '../../../lib/router';
import { FINAL_CTA } from '../../../lib/landingCopy';
import { FinalCTA } from './FinalCTA';

describe('FinalCTA', () => {
  beforeEach(() => {
    if (getRoute() !== '/') navigate('/');
  });

  it('renders the closing headline and CTA', () => {
    render(<FinalCTA />);
    expect(screen.getByRole('heading', { name: FINAL_CTA.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start sharing/i })).toBeInTheDocument();
  });

  it('navigates to /app from the CTA', async () => {
    const user = userEvent.setup();
    render(<FinalCTA />);
    await user.click(screen.getByRole('button', { name: /start sharing/i }));
    expect(getRoute()).toBe('/app');
  });
});
