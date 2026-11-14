import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortError, delay } from '@/lib/async';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('lib/async — cancellable delays', () => {
  it('builds a named AbortError', () => {
    const error = abortError();
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('Session closed');
  });

  it('resolves once the timer has elapsed', async () => {
    vi.useFakeTimers();
    const resolved = vi.fn();
    const pending = delay(1_000, new AbortController().signal).then(resolved);

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(resolved).toHaveBeenCalledTimes(1);
  });

  it('rejects without scheduling a timer when the signal is already aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();

    await expect(delay(1_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects as soon as a pending wait is aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = delay(5_000, controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
