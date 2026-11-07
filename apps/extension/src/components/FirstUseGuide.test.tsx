import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FirstUseGuide } from './FirstUseGuide';
import { snippetService } from '../services';
import { FIRST_USE_KEY } from '../storage/firstUse';
import * as firstUse from '../storage/firstUse';

describe('First-use guidance recovery', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('retries failed progress reads without changing stored data', async () => {
    localStorage.setItem(FIRST_USE_KEY, 'done');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => { throw new Error('Unavailable'); });
    const write = vi.spyOn(Storage.prototype, 'setItem');
    render(<FirstUseGuide snippets={[]} onClose={vi.fn()}><p>Library</p></FirstUseGuide>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your guide progress');
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Library')).toBeInTheDocument();
    expect(localStorage.getItem(FIRST_USE_KEY)).toBe('done');
  });

  it('does not create a shortcut if progress cannot be saved, and permits retry', async () => {
    const create = vi.spyOn(snippetService, 'createSnippet').mockResolvedValue({ id: '1', trigger: '/hello', content: 'Hello there!', createdAt: 1, updatedAt: 1 });
    vi.spyOn(firstUse, 'saveFirstUse').mockRejectedValueOnce(new Error('Could not save your guide progress. Please try again.'));
    render(<FirstUseGuide snippets={[]} onClose={vi.fn()}><p>Library</p></FirstUseGuide>);
    fireEvent.click(await screen.findByRole('button', { name: 'Save shortcut' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your guide progress');
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' }));
    expect(await screen.findByRole('heading', { name: 'Try your shortcut' })).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps creation recoverable when a snippet save fails', async () => {
    vi.spyOn(snippetService, 'createSnippet').mockRejectedValueOnce(new Error('Could not save your snippets. Try again.'));
    render(<FirstUseGuide snippets={[]} onClose={vi.fn()}><p>Library</p></FirstUseGuide>);
    fireEvent.click(await screen.findByRole('button', { name: 'Save shortcut' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your snippets');
    expect(screen.queryByLabelText('Practice field')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Expanded text')).toHaveValue('Hello there!');
  });

  it('does not report a backup download when the library cannot be read', async () => {
    localStorage.setItem(FIRST_USE_KEY, 'active');
    const snippet = { id: '1', trigger: '/hello', content: 'Hello there!', createdAt: 1, updatedAt: 1 };
    vi.spyOn(snippetService, 'getSnippets').mockRejectedValue(new Error('Could not read your saved snippets. Nothing has been changed. Try again.'));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    render(<FirstUseGuide snippets={[snippet]} onClose={vi.fn()}><p>Library</p></FirstUseGuide>);
    const practice = await screen.findByLabelText('Practice field');
    fireEvent.change(practice, { target: { value: '/hello', selectionStart: 6, selectionEnd: 6 } });
    fireEvent.click(screen.getByRole('button', { name: 'Expand shortcut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to backup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read your saved snippets');
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByText(/Download requested/)).not.toBeInTheDocument();
  });
});
