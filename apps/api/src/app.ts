import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { loadConfig } from './config.js';
import { attachPrincipal } from './auth/middleware.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { auditRouter } from './modules/audit/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { flagsRouter } from './modules/flags/routes.js';
import { kycRouter } from './modules/kyc/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { refundsRouter } from './modules/refunds/routes.js';
import { buildOpenApiDocument } from './openapi.js';
import { registerJobHandlers } from './jobs/index.js';

export function createApp(): Express {
  const config = loadConfig();
  registerJobHandlers();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachPrincipal);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  const openApiDocument = buildOpenApiDocument();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use('/api/auth', authRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/refunds', refundsRouter);
  app.use('/api/flags', flagsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/notifications', notificationsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
