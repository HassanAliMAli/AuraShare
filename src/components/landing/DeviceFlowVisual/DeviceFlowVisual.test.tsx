import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { DeviceFlowVisual } from './DeviceFlowVisual';

describe('DeviceFlowVisual', () => {
  it('renders the composition without crashing', () => {
    const { container } = render(<DeviceFlowVisual />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
