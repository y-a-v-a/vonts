export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';

/** The 62 generated characters, in grid order. */
export const CHARSET: readonly string[] = [...LOWER, ...UPPER, ...DIGITS];

export const glyphName = (ch: string): string => {
  if (/[a-z]/.test(ch)) return ch;
  if (/[A-Z]/.test(ch)) return ch;
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][Number(ch)];
};
