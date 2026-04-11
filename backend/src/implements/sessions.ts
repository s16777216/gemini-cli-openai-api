import type { Context } from "hono";
import { SessionRepository } from "../repositories/sessionRepository";

export const ListSessions = async (c: Context) => {
    const repo = SessionRepository.getInstance();
    const sessions = repo.findAll();
    return c.json({ data: sessions });
};

export const GetSessionHistory = async (c: Context) => {
    const id = c.req.param("id");
    const repo = SessionRepository.getInstance();
    const session = repo.findById(id);
    if (!session) {
        return c.json({ error: "Session not found" }, 404);
    }
    return c.json({ data: session });
};

export const DeleteSession = async (c: Context) => {
    const id = c.req.param("id");
    const repo = SessionRepository.getInstance();
    repo.delete(id);
    return c.json({ success: true });
};

export const DeleteAllSessions = async (c: Context) => {
    const repo = SessionRepository.getInstance();
    repo.deleteAll();
    return c.json({ success: true });
};
