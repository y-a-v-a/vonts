import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleTimer } from '../../src/idle';

describe('IdleTimer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the delay since the last poke', () => {
    const cb = vi.fn();
    const t = new IdleTimer(3000, cb, () => Date.now());
    t.poke();
    vi.advanceTimersByTime(2000);
    t.poke();
    vi.advanceTimersByTime(2999);
    expect(cb).not.toHaveBeenCalled();
    expect(t.progress()).toBeGreaterThan(0);
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(t.pending).toBe(false);
    expect(t.progress()).toBe(0);
  });

  it('hold cancels, flush fires immediately', () => {
    const cb = vi.fn();
    const t = new IdleTimer(3000, cb);
    t.poke();
    t.hold();
    vi.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
    t.poke();
    t.flush();
    expect(cb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
