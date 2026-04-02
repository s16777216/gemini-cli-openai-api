export interface ApiKey {
    id: string;
    token: string;
    label: string;
    status: 'active' | 'revoked';
    createdAt: number;
}

export interface CreateKeyRequest {
    label: string;
}
