import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: env.NODE_ENV === 'development'
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN
  });

  app.get('/health', async () => {
    return { status: 'ok', service: 'Fillin Backend API' };
  });

  return app;
}
