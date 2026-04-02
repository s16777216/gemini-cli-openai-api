import type { Context } from "hono";
import ChatCompletions from "./chat";
import ModelList from "./modelList";
import { ListKeys, CreateKey, RevokeKey } from "./keys";
import { Login } from "./admin";
import { ListSessions, GetSessionHistory, DeleteSession } from "./sessions";

interface Implementations {
    ChatCompletions: (c: Context) => Promise<Response>;
    ModelList: (c: Context) => Promise<Response>;
    ListKeys: (c: Context) => Promise<Response>;
    CreateKey: (c: Context) => Promise<Response>;
    RevokeKey: (c: Context) => Promise<Response>;
    Login: (c: Context) => Promise<Response>;
    ListSessions: (c: Context) => Promise<Response>;
    GetSessionHistory: (c: Context) => Promise<Response>;
    DeleteSession: (c: Context) => Promise<Response>;
}

const Implementations: Implementations = {
    ChatCompletions,
    ModelList,
    ListKeys,
    CreateKey,
    RevokeKey,
    Login,
    ListSessions,
    GetSessionHistory,
    DeleteSession
};

export default Implementations;