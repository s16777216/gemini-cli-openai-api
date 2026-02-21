import { Hono } from 'hono';
import { logger } from 'hono/logger';
import Implementations from './implements';

const app = new Hono();

app.basePath('/v1')
    .use('*', logger())
    .get('/', (c) => c.text('Gemini CLI Proxy is running!'))
    .get('/models', Implementations.ModelList)
    .post('/chat/completions', Implementations.ChatCompletions);

export default {
    port: 3000,
    fetch: app.fetch,
    idleTimeout: 120 // 120 seconds 
};