import z from "zod";

export const MessageSchema = z.object({
    role: z.string(),
    content: z.union([z.string(), z.array(z.any()), z.null(), z.undefined()]),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
    name: z.string().optional(),
}).loose();

export const ChatCompletionSchema = z.object({
    model: z.string().optional(),
    messages: z.array(MessageSchema),
    stream: z.boolean().optional(),
    tools: z.array(z.any()).optional(),
    tool_choice: z.any().optional(),
}).loose();

export interface Message {
    role: string;
    content: string | any[] | null | undefined;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}
