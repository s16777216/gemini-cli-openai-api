import type { Context } from "hono";
import ChatCompletions from "./chat";
import ModelList from "./modelList";
import { ListKeys, CreateKey, RevokeKey } from "./keys";
import { Login, GetDashboardStats } from "./admin";
import { ListSessions, GetSessionHistory, DeleteSession, DeleteAllSessions } from "./sessions";
import { ListUpstreams, CreateUpstream, DeleteUpstream } from "./upstream";
import { OAuthLogin, OAuthCallback } from "./auth";

interface Implementations {
    ChatCompletions: (c: Context) => Promise<Response>;
    ModelList: (c: Context) => Promise<Response>;
    ListKeys: (c: Context) => Promise<Response>;
    CreateKey: (c: Context) => Promise<Response>;
    RevokeKey: (c: Context) => Promise<Response>;
    Login: (c: Context) => Promise<Response>;
    GetDashboardStats: (c: Context) => Promise<Response>;
    ListSessions: (c: Context) => Promise<Response>;
    GetSessionHistory: (c: Context) => Promise<Response>;
    DeleteSession: (c: Context) => Promise<Response>;
    DeleteAllSessions: (c: Context) => Promise<Response>;
    ListUpstreams: (c: Context) => Promise<Response>;
    CreateUpstream: (c: Context) => Promise<Response>;
    DeleteUpstream: (c: Context) => Promise<Response>;
    OAuthLogin: (c: Context) => Promise<Response>;
    OAuthCallback: (c: Context) => Promise<Response>;
}

const Implementations: Implementations = {
    ChatCompletions,
    ModelList,
    ListKeys,
    CreateKey,
    RevokeKey,
    Login,
    GetDashboardStats,
    ListSessions,
    DeleteAllSessions,
    GetSessionHistory,
    DeleteSession,
    ListUpstreams,
    CreateUpstream,
    DeleteUpstream,
    OAuthLogin,
    OAuthCallback
};

export default Implementations;