/**
 * 輕量結構化 Logger
 *
 * 環境變數：
 *   LOG_LEVEL=debug|info|warn|error  （預設 info）
 *   LOG_FORMAT=json|text             （預設 text）
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS: Record<LogLevel, string> = {
    debug: '\x1b[36m',   // cyan
    info: '\x1b[32m',   // green
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',   // red
};
const RESET = '\x1b[0m';

const configuredLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const useJson = process.env.LOG_FORMAT === 'json';

function log(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVELS[level] < LEVELS[configuredLevel]) return;

    const ts = new Date().toISOString();

    if (useJson) {
        const entry = { ts, level, message, ...fields };
        process.stderr.write(JSON.stringify(entry) + '\n');
        return;
    }

    // 人類可讀格式
    const color = COLORS[level];
    const label = `${color}[${level.toUpperCase()}]${RESET}`;
    const fieldsStr = fields && Object.keys(fields).length > 0
        ? ' ' + Object.entries(fields).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')
        : '';

    const line = `${ts} ${label} ${message}${fieldsStr}`;

    if (level === 'error' || level === 'warn') {
        process.stderr.write(line + '\n');
    } else {
        process.stdout.write(line + '\n');
    }
}

export const logger = {
    debug: (msg: string, fields?: LogFields) => log('debug', msg, fields),
    info: (msg: string, fields?: LogFields) => log('info', msg, fields),
    warn: (msg: string, fields?: LogFields) => log('warn', msg, fields),
    error: (msg: string, fields?: LogFields) => log('error', msg, fields),
};
