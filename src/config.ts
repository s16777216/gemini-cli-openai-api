export const config = {
    port: Number(Bun.env.PORT ?? 3000),
    idleTimeout: 120,
    tempFolder: Bun.env.TEMP_FOLDER ?? "./temp",
    defaultModel: "gemini-2.5-flash",
    models: [
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-3-flash-preview",
        "gemini-3-pro-preview",
    ],
} as const;
