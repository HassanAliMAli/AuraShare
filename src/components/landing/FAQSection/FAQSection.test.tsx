import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FAQS } from '../../../lib/landingCopy';
import { FAQSection } from './FAQSection';

describe('FAQSection', () => {
  it('renders every question', () => {
    render(<FAQSection />);
    for (const item of FAQS) {
      expect(screen.getByRole('button', { name: item.q })).toBeInTheDocument();
    }
  });

  it('opens the first item by default', () => {
    render(<FAQSection />);
    const first = screen.getByRole('button', { name: FAQS[0]!.q });
    expect(first).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps exactly one item open at a time', async () => {
    const user = userEvent.setup();
    render(<FAQSection />);

    await user.click(screen.getByRole('button', { name: FAQS[1]!.q }));

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false');
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true');

    const open = buttons.filter((b) => b.getAttribute('aria-expanded') === 'true');
    expect(open).toHaveLength(1);
  });

  it('reveals the answer for the open item via an accessible region', () => {
    render(<FAQSection />);
    const first = screen.getByRole('button', { name: FAQS[0]!.q });
    const panelId = first.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();

    const region = document.getElementById(panelId!);
    expect(region).toHaveAttribute('role', 'region');
    expect(within(region as HTMLElement).getByText(FAQS[0]!.a)).toBeInTheDocument();
  });
});
