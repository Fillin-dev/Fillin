import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SuggestionToggle } from './SuggestionToggle';
import { suggestionSettings } from '../services/SuggestionSettings';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('suggestion preference', () => {
  it('updates immediately but restores the saved choice on write failure', async () => {
    vi.spyOn(suggestionSettings, 'get').mockResolvedValue(false);
    let reject!: (error: Error) => void;
    vi.spyOn(suggestionSettings, 'set').mockImplementation(
      () =>
        new Promise((_, failed) => {
          reject = failed;
        })
    );
    render(<SuggestionToggle />);
    const toggle = screen.getByRole('checkbox');
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    reject(new Error('Failed'));
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
  });
  it('keeps the preference disabled after a read failure and supports retry', async () => {
    vi.spyOn(suggestionSettings, 'get')
      .mockRejectedValueOnce(new Error('Read failed'))
      .mockResolvedValue(true);
    render(<SuggestionToggle />);
    await screen.findByRole('alert');
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    expect(screen.getByRole('checkbox')).toBeEnabled();
  });
});
