import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import Implementations from './implements';
import { config } from './config';
import { authMiddleware } from './utils/auth';

const app = new Hono();

app.use('*', logger());

// WebUI 靜態檔案服務
app.use('/*', serveStatic({ root: './public' }));
app.get('/', serveStatic({ path: './public/index.html' }));

app.basePath('/v1')
    .post('/admin/login', Implementations.Login) // 登入端點不需驗證
    .use('*', authMiddleware)
    // 管理端點
    .get('/admin/keys', Implementations.ListKeys)
    .post('/admin/keys', Implementations.CreateKey)
    .delete('/admin/keys/:id', Implementations.RevokeKey)
    // 標準 OpenAI 相容端點
    .get('/', (c) => c.text('Gemini CLI Proxy is running!'))
    .get('/models', Implementations.ModelList)
    .post('/chat/completions', Implementations.ChatCompletions)
    // 恢復：Session 歷史管理
    .get('/sessions', Implementations.ListSessions)
    .get('/sessions/:id', Implementations.GetSessionHistory)
    .delete('/sessions/:id', Implementations.DeleteSession);

export default {
    port: config.port,
    fetch: app.fetch,
    idleTimeout: config.idleTimeout
};