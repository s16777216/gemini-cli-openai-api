export const config = {
    port: Number(Bun.env.PORT ?? 3002),
    idleTimeout: 120,
    databasePath: Bun.env.DATABASE_PATH || "./data/api_keys.db",
    defaultModel: "gemini-3-flash-preview",
    models: [
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-3-flash-preview",
        "gemini-3-pro-preview",
    ],
    jwtSecret: Bun.env.JWT_SECRET || "default-secret-change-me",
    rootUser: Bun.env.ROOT_USER || "admin",
    rootPassword: Bun.env.ROOT_PASSWORD || "admin",
    
    // Google OAuth2 Constants (Official Code Assist Client)
    googleClientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
    googleClientSecret: "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",
    googleScopes: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ]
} as const;
