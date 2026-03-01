import { z } from "zod";

export const DbMessageSchema = z.object({
    id: z.number().optional(),
    sessionId: z.string(),
    role: z.enum(["user", "ai"]),
    content: z.string(),
    createdAt: z.number(),
});

export const SessionSchema = z.object({
    id: z.string(),
    title: z.string(),
    model: z.string().optional(),
    updatedAt: z.number(),
    messages: z.array(DbMessageSchema).optional(),
});

export type DbMessage = z.infer<typeof DbMessageSchema>;
export type Session = z.infer<typeof SessionSchema>;
