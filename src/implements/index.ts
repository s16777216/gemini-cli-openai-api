import type { Context } from "hono";
import ChatCompletions from "./chat";
import ModelList from "./modelList";

interface Implementations {
    ChatCompletions: (c: Context) => Promise<Response>;
    ModelList: (c: Context) => Promise<Response>;
}

const Implementations: Implementations = {
    ChatCompletions,
    ModelList
}

export default Implementations;