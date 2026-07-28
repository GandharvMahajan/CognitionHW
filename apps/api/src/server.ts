import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { startWorker } from './services/jobs.js';

const config = loadConfig();
const app = createApp();

const server = app.listen(config.API_PORT, () => {
  logger.info({ port: config.API_PORT }, 'API listening');
});

const stopWorker = config.WORKER_ENABLED ? startWorker(config.WORKER_INTERVAL_MS) : () => undefined;

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  stopWorker();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
