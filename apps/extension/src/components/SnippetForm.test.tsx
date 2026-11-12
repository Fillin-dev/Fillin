import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SnippetForm } from './SnippetForm';
import { Snippet } from '@fillin/shared';

describe('SnippetForm Conflict & Duplicate Detection', () => {
  it('saves inline mode only on explicit opt-in and clears it when template mode is disabled', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const original: Snippet = { id: 'inline', trigger: '/inline', content: '{{name}}', templateVersion: 1, editAfterInsert: true, createdAt: 1, updatedAt: 1 };
    render(<SnippetForm snippet={original} onSave={onSave} onCancel={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /Edit fields after insertion/ })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /Use template values/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Snippet' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('/inline', '{{name}}', false, undefined, { templateVersion: undefined, dateFormat: undefined, editAfterInsert: undefined }));
    expect(original.editAfterInsert).toBe(true);
  });
  it('previews fill-in fields without collecting or storing answers in the editor', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SnippetForm onSave={onSave} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Shortcut'), { target: { value: 'reply' } });
    fireEvent.change(screen.getByLabelText('Expanded text'), { target: { value: 'Hi {{name}}, {{company}} / {{name}}' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Use template values/ }));
    expect(screen.getByText('Hi ‹name›, ‹company› / ‹name›')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save Snippet' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('/reply', 'Hi {{name}}, {{company}} / {{name}}', false, undefined, { templateVersion: 1, dateFormat: 'friendly' }));
  });
  it('converts an existing today snippet only after explicit save', async () => {
    const original: Snippet = {
      id: 'today',
      trigger: '/today',
      content: 'My saved date',
      createdAt: 1,
      updatedAt: 1,
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(<SnippetForm snippet={original} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make /today show the current date' }));
    expect(original.content).toBe('My saved date');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Expanded text')).toHaveValue('{{date}}');
    fireEvent.click(screen.getByRole('button', { name: 'Update Snippet' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('/today', '{{date}}', false, undefined, {
        templateVersion: 1,
        dateFormat: 'friendly',
      })
    );
  });
  it('keeps conversion temporary when cancelled and blocks unsupported template values', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <SnippetForm
        snippet={{ id: 'today', trigger: '/today', content: 'Keep me', createdAt: 1, updatedAt: 1 }}
        onSave={onSave}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Make /today show the current date' }));
    fireEvent.change(screen.getByLabelText('Expanded text'), { target: { value: '{{clipboard}}' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported template value');
    expect(screen.getByRole('button', { name: 'Update Snippet' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
  const existingSnippets: Snippet[] = [
    {
      id: '1',
      trigger: '/email',
      content: 'test@example.com',
      isHtml: false,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: '2',
      trigger: '/sig',
      content: 'Best regards',
      isHtml: false,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('shows duplicate trigger warning and suggestions when exact match exists', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(<SnippetForm existingSnippets={existingSnippets} onSave={onSave} onCancel={onCancel} />);

    const triggerInput = screen.getByPlaceholderText('email, name, sig...');
    fireEvent.change(triggerInput, { target: { value: 'email' } });

    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    // Verify suggestion pills exist
    expect(screen.getByText('/email2')).toBeInTheDocument();

    // Clicking suggestion updates the trigger
    fireEvent.click(screen.getByText('/email2'));
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  it('shows prefix overlap warning when trigger is substring of existing trigger', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(<SnippetForm existingSnippets={existingSnippets} onSave={onSave} onCancel={onCancel} />);

    const triggerInput = screen.getByPlaceholderText('email, name, sig...');
    // Type /e which is a prefix of /email
    fireEvent.change(triggerInput, { target: { value: 'e' } });

    expect(screen.getByText(/Shares prefix with "\/email"/i)).toBeInTheDocument();
  });

  it('allows saving when trigger is unique', async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(<SnippetForm existingSnippets={existingSnippets} onSave={onSave} onCancel={onCancel} />);

    const triggerInput = screen.getByPlaceholderText('email, name, sig...');
    const contentInput = screen.getByPlaceholderText('The text that will be inserted...');

    fireEvent.change(triggerInput, { target: { value: 'phone' } });
    fireEvent.change(contentInput, { target: { value: '+123456789' } });

    fireEvent.submit(screen.getByText('Save Snippet').closest('form')!);
    expect(onSave).toHaveBeenCalledWith('/phone', '+123456789', false, undefined);
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });
});
