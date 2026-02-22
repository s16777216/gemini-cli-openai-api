import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import Implementations from './implements';
import { config } from './config';

const app = new Hono();

app.use('*', logger());

// WebUI 靜態檔案服務
app.use('/*', serveStatic({ root: './public' }));
app.get('/', serveStatic({ path: './public/index.html' }));

app.basePath('/v1')
    .get('/', (c) => c.text('Gemini CLI Proxy is running!'))
    .get('/models', Implementations.ModelList)
    .post('/chat/completions', Implementations.ChatCompletions);

export default {
    port: config.port,
    fetch: app.fetch,
    idleTimeout: config.idleTimeout
};