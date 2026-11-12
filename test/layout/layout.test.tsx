import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingNav } from '@/components/layout/LandingNav';
import { LandingFooter } from '@/components/layout/LandingFooter';
import { SiteNav } from '@/components/layout/SiteNav';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { FOOTER, NAV_LINKS } from '@/lib/landingCopy';
import { getRoute } from '@/lib/router';
import { renderWithStore, resetRoute } from '../shared/fixtures';

describe('layout/layout — LandingNav', () => {
  beforeEach(() => resetRoute('/'));

  it('renders the brand, every anchor, and the CTA', () => {
    renderWithStore(<LandingNav />);

    expect(screen.getByRole('link', { name: 'AuraShare — back to top' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start sharing/i })).toBeInTheDocument();
    for (const link of NAV_LINKS) {
      expect(screen.getByRole('link', { name: link.label })).toHaveAttribute(
        'href',
        link.href,
      );
    }
  });

  it('navigates to the app when the CTA is clicked', async () => {
    const user = userEvent.setup();
    renderWithStore(<LandingNav />);

    await user.click(screen.getByRole('button', { name: /start sharing/i }));
    expect(getRoute()).toBe('/app');
  });
});

describe('layout/layout — LandingFooter', () => {
  it('renders the tagline, guarantee strip, and back-to-top link', () => {
    renderWithStore(<LandingFooter />);

    expect(screen.getByText(FOOTER.tagline)).toBeInTheDocument();
    for (const trust of FOOTER.trust) {
      expect(screen.getByText(trust)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Back to top' })).toHaveAttribute('href', '#top');
  });

  it('lists every navigation anchor', () => {
    renderWithStore(<LandingFooter />);
    for (const link of NAV_LINKS) {
      expect(screen.getAllByRole('link', { name: link.label }).length).toBeGreaterThan(0);
    }
  });
});

describe('layout/layout — SiteNav', () => {
  it('resets the session from the brand button', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    renderWithStore(<SiteNav />, { actions: { reset } });

    await user.click(screen.getByRole('button', { name: 'AuraShare — start over' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does not nest a heading inside the brand button', () => {
    renderWithStore(<SiteNav />);
    const brand = screen.getByRole('button', { name: 'AuraShare — start over' });
    expect(brand.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
  });

  it('enters receive mode from the Receive button', async () => {
    const user = userEvent.setup();
    const startReceive = vi.fn();
    renderWithStore(<SiteNav />, { actions: { startReceive } });

    await user.click(screen.getByRole('button', { name: 'Receive' }));
    expect(startReceive).toHaveBeenCalledTimes(1);
  });
});

describe('layout/layout — SiteFooter', () => {
  it('renders the three guarantees', () => {
    renderWithStore(<SiteFooter />);
    expect(screen.getByText('NO ACCOUNT')).toBeInTheDocument();
    expect(screen.getByText('NO SERVER')).toBeInTheDocument();
    expect(screen.getByText('END-TO-END ENCRYPTED')).toBeInTheDocument();
  });
});
