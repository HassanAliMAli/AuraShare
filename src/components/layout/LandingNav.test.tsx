import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getRoute, navigate } from '../../lib/router';
import { NAV_LINKS } from '../../lib/landingCopy';
import { LandingNav } from './LandingNav';

describe('LandingNav', () => {
  beforeEach(() => {
    if (getRoute() !== '/') navigate('/');
  });

  it('renders the brand and the Start Sharing CTA', () => {
    render(<LandingNav />);
    expect(screen.getByRole('link', { name: 'AuraShare — back to top' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start sharing/i })).toBeInTheDocument();
  });

  it('renders all anchor links', () => {
    render(<LandingNav />);
    for (const link of NAV_LINKS) {
      const el = screen.getByRole('link', { name: link.label });
      expect(el).toHaveAttribute('href', link.href);
    }
  });

  it('navigates to /app when Start Sharing is clicked', async () => {
    const user = userEvent.setup();
    render(<LandingNav />);
    await user.click(screen.getByRole('button', { name: /start sharing/i }));
    expect(getRoute()).toBe('/app');
  });
});
