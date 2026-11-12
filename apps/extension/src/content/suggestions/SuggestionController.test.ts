import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuggestionController } from './SuggestionController';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
describe('suggestion privacy exclusions', () => {
  it('does not read a password value or scan snippets when disabled, blocked, or protected', () => {
    const password = document.createElement('input');
    password.type = 'password';
    document.body.append(password);
    const value = vi.fn(() => {
      throw new Error('Sensitive value read');
    });
    Object.defineProperty(password, 'value', { get: value });
    const snippets = vi.fn(() => []);
    const controller = new SuggestionController({
      snippets,
      allowed: () => true,
      target: () => password,
      paletteOpen: () => false,
    });
    password.dispatchEvent(new Event('input', { bubbles: true }));
    controller.setEnabled(true);
    password.dispatchEvent(new Event('input', { bubbles: true }));
    expect(value).not.toHaveBeenCalled();
    expect(snippets).not.toHaveBeenCalled();
    expect(document.getElementById('fillin-suggestions-host')).toBeNull();
    controller.destroy();
  });
  it('rejects blocked sites before reading the active target and removes its listeners on destruction', () => {
    const target = vi.fn(() => null);
    const controller = new SuggestionController({
      snippets: () => [],
      allowed: () => false,
      target,
      paletteOpen: () => false,
    });
    controller.setEnabled(true);
    document.dispatchEvent(new Event('input'));
    expect(target).not.toHaveBeenCalled();
    controller.destroy();
    document.dispatchEvent(new Event('input'));
    expect(target).not.toHaveBeenCalled();
  });
});
