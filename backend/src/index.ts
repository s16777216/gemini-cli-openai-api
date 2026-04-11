import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import Implementations from './implements';
import { config } from './config';
import { authMiddleware } from './utils/auth';
import { ApiKeyRepository } from './repositories/apiKeyRepository';

const app = new Hono();

// 強制在伺服器啟動時建立資料庫與 Table，確保 Session/Messages 可用
ApiKeyRepository.getInstance();

app.use('*', logger());

// WebUI 靜態檔案服務 (移至 /web)
app.get('/', (c) => c.redirect('/web'));

app.use('/web/*', serveStatic({ 
    root: '../frontend/dist',
    rewriteRequestPath: (p) => p.replace(/^\/web/, '')
}));
app.use('/web/*', serveStatic({ 
    root: './public',
    rewriteRequestPath: (p) => p.replace(/^\/web/, '')
}));

// SPA Routing Fallback (為了解決直接進入 /web/chat 會 404 的問題)
app.get('/web/*', serveStatic({ path: '../frontend/dist/index.html' }));
app.get('/web/*', serveStatic({ path: './public/index.html' }));

app.basePath('/v1')
    .post('/admin/login', Implementations.Login)
    .get('/admin/auth/login', Implementations.OAuthLogin)
    .get('/admin/auth/callback', Implementations.OAuthCallback)
    .use('*', authMiddleware)
    // 管理端點
    .get('/admin/keys', Implementations.ListKeys)
    .post('/admin/keys', Implementations.CreateKey)
    .delete('/admin/keys/:id', Implementations.RevokeKey)
    // 上游憑證管理
    .get('/admin/upstreams', Implementations.ListUpstreams)
    .post('/admin/upstreams', Implementations.CreateUpstream)
    .delete('/admin/upstreams/:id', Implementations.DeleteUpstream)
    // 標準 OpenAI 相容端點
    .get('/', (c) => c.text('Gemini CLI Proxy is running!'))
    .get('/models', Implementations.ModelList)
    .post('/chat/completions', Implementations.ChatCompletions)
    // 恢復：Session 歷史管理
    .get('/sessions', Implementations.ListSessions)
    .delete('/sessions', Implementations.DeleteAllSessions)
    .get('/sessions/:id', Implementations.GetSessionHistory)
    .delete('/sessions/:id', Implementations.DeleteSession);

export default {
    port: config.port,
    fetch: app.fetch,
    idleTimeout: config.idleTimeout
};