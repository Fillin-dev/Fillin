import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from './app';

describe('Backend API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the health status', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'Fillin Backend API' });
  });

  it('does not accept signups at the removed endpoint', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/waitlist',
      payload: { email: 'test@example.com' },
    });
    expect(response.statusCode).toBe(404);
  });
});
