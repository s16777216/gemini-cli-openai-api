import type { Context } from "hono";

export default async function ModelList(c: Context) {
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
}