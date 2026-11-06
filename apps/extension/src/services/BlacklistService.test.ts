import { describe, it, expect, beforeEach } from 'vitest';
import { BlacklistService } from './BlacklistService';

describe('BlacklistService', () => {
  let service: BlacklistService;

  beforeEach(() => {
    localStorage.clear();
    service = new BlacklistService();
  });

  it('normalizes domains accurately', () => {
    expect(service.normalizeDomain('https://www.chase.com/login')).toBe(
      'chase.com'
    );
    expect(service.normalizeDomain('http://localhost:3000/app')).toBe(
      'localhost'
    );
    expect(service.normalizeDomain('GITHUB.COM/')).toBe('github.com');
    expect(service.normalizeDomain('sub.domain.org?query=1')).toBe(
      'sub.domain.org'
    );
  });

  it('adds domains and avoids duplicates', async () => {
    let list = await service.addDomain('chase.com');
    expect(list).toEqual(['chase.com']);

    list = await service.addDomain('https://www.chase.com/dashboard');
    expect(list).toEqual(['chase.com']);

    list = await service.addDomain('fidelity.com');
    expect(list).toEqual(['chase.com', 'fidelity.com']);
  });

  it('removes domains properly', async () => {
    await service.addDomain('chase.com');
    await service.addDomain('fidelity.com');

    const updated = await service.removeDomain('chase.com');
    expect(updated).toEqual(['fidelity.com']);
  });

  it('checks if a domain or its subdomain is blacklisted', async () => {
    await service.addDomain('chase.com');

    expect(await service.isDomainBlacklisted('chase.com')).toBe(true);
    expect(await service.isDomainBlacklisted('secure.chase.com')).toBe(true);
    expect(await service.isDomainBlacklisted('github.com')).toBe(false);
  });

  it('toggles a domain', async () => {
    const res1 = await service.toggleDomain('chase.com');
    expect(res1.blacklisted).toBe(true);
    expect(res1.list).toEqual(['chase.com']);

    const res2 = await service.toggleDomain('chase.com');
    expect(res2.blacklisted).toBe(false);
    expect(res2.list).toEqual([]);
  });

  it('preserves simultaneous additions from separate preview instances', async () => {
    const other = new BlacklistService();
    await Promise.all([
      service.addDomain('chase.com'),
      other.addDomain('github.com'),
    ]);
    expect(await service.getBlacklist()).toEqual(['chase.com', 'github.com']);
  });

  it('serializes concurrent preview toggles without nested locks', async () => {
    const other = new BlacklistService();
    const results = await Promise.all([
      service.toggleDomain('chase.com'),
      other.toggleDomain('chase.com'),
    ]);
    expect(results.map((result) => result.blacklisted)).toEqual([true, false]);
    expect(await service.getBlacklist()).toEqual([]);
  });

  it('leaves unreadable preview settings untouched and allows retry', async () => {
    localStorage.setItem('fillin_blacklist', 'broken JSON');
    await expect(service.addDomain('github.com')).rejects.toThrow(
      'Nothing has been changed'
    );
    expect(localStorage.getItem('fillin_blacklist')).toBe('broken JSON');
    localStorage.setItem('fillin_blacklist', JSON.stringify(['keep.com']));
    expect(await service.addDomain('github.com')).toEqual([
      'keep.com',
      'github.com',
    ]);
  });
});
