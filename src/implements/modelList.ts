import type { Context } from "hono";
import { config } from "../config";

export default async function ModelList(c: Context) {
    return c.json({
        object: 'list',
        data: config.models.map(id => ({
            id,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'google'
        }))
    });
}