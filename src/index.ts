import { Hono } from 'hono';
import { logger } from 'hono/logger';
import ChatCompletions from './implements/chat';

const app = new Hono();

app.use('*', logger());

app.basePath('/v1');

app.get('/', (c) => c.text('Gemini CLI Proxy is running!'));

app.get('/models', (c) => {
    const models = [
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        "gemini-3-flash-preview",
        'gemini-3-pro-preview',
    ];

    return c.json({
        object: 'list',
        data: models.map(id => ({
            id,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'google'
        }))
    });
});


app.post('/chat/completions', ChatCompletions);

export default {
    port: 3000,
    fetch: app.fetch,
    idleTimeout: 120 // 120 seconds 
};