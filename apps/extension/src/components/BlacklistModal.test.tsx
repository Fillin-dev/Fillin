import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BlacklistModal } from './BlacklistModal';

describe('BlacklistModal', () => {
  it('renders current domain and list of blacklisted domains', async () => {
    const onToggle = vi.fn();
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();

    render(
      <BlacklistModal
        currentDomain="github.com"
        isCurrentDomainBlacklisted={false}
        blacklistedDomains={['chase.com', 'bankofamerica.com']}
        onToggleCurrentDomain={onToggle}
        onAddDomain={onAdd}
        onRemoveDomain={onRemove}
        onClose={onClose}
      />
    );

    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByText('chase.com')).toBeInTheDocument();
    expect(screen.getByText('bankofamerica.com')).toBeInTheDocument();

    // Toggle current domain
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onToggle).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('Unblock chase.com')).toBeEnabled());

    // Remove domain
    const removeBtn = screen.getByLabelText('Unblock chase.com');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('chase.com');
    await waitFor(() => expect(screen.getByLabelText('Close')).toBeEnabled());

    // Close modal
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('allows manually adding a domain', async () => {
    const onAdd = vi.fn();

    render(
      <BlacklistModal
        currentDomain={null}
        isCurrentDomainBlacklisted={false}
        blacklistedDomains={[]}
        onToggleCurrentDomain={vi.fn()}
        onAddDomain={onAdd}
        onRemoveDomain={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('e.g. chase.com, bank.org');
    fireEvent.change(input, { target: { value: 'https://paypal.com/signin' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/i }));

    expect(onAdd).toHaveBeenCalledWith('https://paypal.com/signin');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('preserves the entered domain when saving fails', async () => {
    render(
      <BlacklistModal
        currentDomain={null}
        isCurrentDomainBlacklisted={false}
        blacklistedDomains={[]}
        onToggleCurrentDomain={vi.fn()}
        onAddDomain={vi.fn().mockResolvedValue(false)}
        onRemoveDomain={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Block a website');
    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('example.com');
  });
});
