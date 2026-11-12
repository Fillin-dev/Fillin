import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureEditor } from './CaptureEditor';
import { snippetService } from '../services';

vi.mock('../services', () => ({ snippetService: { getSnippets: vi.fn(), createSnippet: vi.fn() } }));
let send: ReturnType<typeof vi.fn<[any], Promise<any>>>;
let close: MockInstance<[], void>;
beforeEach(() => {
  vi.clearAllMocks();
  history.replaceState({}, '', `/?capture=${crypto.randomUUID()}`);
  send = vi.fn(async (message) => message.type === 'FILLIN_CAPTURE_READ' ? { ok: true, text: '<b>{{date}}</b>' } : { ok: true });
  vi.stubGlobal('chrome', { runtime: { sendMessage: send }, windows: { getCurrent: async () => ({ id: 7 }) } });
  vi.mocked(snippetService.getSnippets).mockResolvedValue([]);
  vi.mocked(snippetService.createSnippet).mockResolvedValue({ id: 'saved', trigger: '/new', content: '<b>{{date}}</b>', createdAt: 1, updatedAt: 1 });
  close = vi.spyOn(window, 'close').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState({}, '', '/'); });

it('prefills plain text without interpreting HTML or date tokens', async () => {
  render(<CaptureEditor />);
  expect(await screen.findByLabelText('Expanded text')).toHaveValue('<b>{{date}}</b>');
  expect(screen.getByRole('checkbox', { name: /Use template values/ })).not.toBeChecked();
  fireEvent.change(screen.getByPlaceholderText('email, name, sig...'), { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Snippet' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(snippetService.createSnippet).toHaveBeenCalledWith('/new', '<b>{{date}}</b>', false, undefined, undefined);
});

it('retries draft cleanup after a successful save without creating a second snippet', async () => {
  send.mockImplementation(async (message) => message.type === 'FILLIN_CAPTURE_READ' ? { ok: true, text: 'Keep' } : { ok: false });
  render(<CaptureEditor />);
  await screen.findByLabelText('Expanded text');
  fireEvent.change(screen.getByPlaceholderText('email, name, sig...'), { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Snippet' }));
  await screen.findByText('Your shortcut is ready.');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Retry'));
  send.mockResolvedValue({ ok: true });
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(snippetService.createSnippet).toHaveBeenCalledTimes(1);
});

it('keeps the edited draft on a failed save, and cancellation never creates a snippet', async () => {
  vi.mocked(snippetService.createSnippet).mockRejectedValueOnce(new Error('Storage unavailable'));
  render(<CaptureEditor />);
  await screen.findByLabelText('Expanded text');
  fireEvent.change(screen.getByLabelText('Expanded text'), { target: { value: 'My edited selection' } });
  fireEvent.change(screen.getByPlaceholderText('email, name, sig...'), { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Snippet' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable');
  expect(screen.getByLabelText('Expanded text')).toHaveValue('My edited selection');
  expect(send.mock.calls.filter(([m]) => m.type === 'FILLIN_CAPTURE_DISCARD')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  await waitFor(() => expect(close).toHaveBeenCalled());
  expect(snippetService.createSnippet).toHaveBeenCalledTimes(1);
  expect(send.mock.calls.filter(([m]) => m.type === 'FILLIN_CAPTURE_DISCARD')).toHaveLength(1);
});

it('shows a recoverable read failure instead of an empty form', async () => {
  send.mockResolvedValueOnce({ ok: false, error: 'Draft unavailable' });
  render(<CaptureEditor />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Draft unavailable');
  expect(screen.queryByLabelText('Expanded text')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Expanded text')).toHaveValue('<b>{{date}}</b>');
});
