export interface Message {
  id?: number;
  sessionId: string;
  role: 'user' | 'ai';
  content: string;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  model?: string;
  updatedAt: number;
  messages?: Message[];
}

export interface ApiKey {
  id: string;
  token: string;
  label: string;
  status: 'active' | 'revoked';
  createdAt: number;
}

export interface Model {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface UpstreamCredential {
  id: string;
  type: 'api_key' | 'oauth2';
  label: string;
  config: string;
  status: 'active' | 'rate_limited' | 'invalid';
  weight: number;
  lastUsedAt?: number;
  createdAt: number;
}

export interface ApiResponse<T> {
  data: T;
}

export interface SuccessResponse {
  success: boolean;
}
