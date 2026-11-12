import { afterEach, expect, it, vi } from 'vitest';
import { isSafeSelection } from './selectionGuard';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('checks password, OTP, readonly and disabled exclusions before reading input values', () => {
  for (const attrs of ['type="password"', 'autocomplete="one-time-code"', 'readonly', 'disabled', 'autocomplete="current-password"']) {
    document.body.innerHTML = `<input ${attrs}>`;
    const input = document.querySelector('input')!;
    const value = vi.spyOn(input, 'value', 'get').mockImplementation(() => { throw new Error('Private value accessed'); });
    expect(isSafeSelection(input, 'private')).toBe(false);
    expect(value).not.toHaveBeenCalled();
  }
});

it('requires the original selection to still match and the field to remain connected', () => {
  document.body.innerHTML = '<textarea>Before selected after</textarea>';
  const input = document.querySelector('textarea')!;
  input.setSelectionRange(7, 15);
  expect(isSafeSelection(input, 'selected')).toBe(true);
  expect(isSafeSelection(input, 'other')).toBe(false);
  input.remove();
  expect(isSafeSelection(input, 'selected')).toBe(false);
});
