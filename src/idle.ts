/**
 * Fires `callback` once the user has been idle for `delay` ms.
 * poke() restarts the countdown, hold() pauses it (e.g. while a drag is in progress).
 */
export class IdleTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private deadline = 0;

  constructor(
    private readonly delay: number,
    private readonly callback: () => void,
    private readonly now: () => number = () => Date.now(),
  ) {}

  poke(): void {
    this.clear();
    this.deadline = this.now() + this.delay;
    this.handle = setTimeout(() => {
      this.handle = null;
      this.callback();
    }, this.delay);
  }

  hold(): void {
    this.clear();
  }

  /** Fire right away (if pending or not). */
  flush(): void {
    this.clear();
    this.callback();
  }

  get pending(): boolean {
    return this.handle !== null;
  }

  /** Remaining time as a fraction of the delay, 0 when nothing is pending. */
  progress(): number {
    if (!this.pending) return 0;
    return Math.max(0, Math.min(1, (this.deadline - this.now()) / this.delay));
  }

  private clear(): void {
    if (this.handle !== null) clearTimeout(this.handle);
    this.handle = null;
  }
}
