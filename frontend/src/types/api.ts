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

export interface ApiResponse<T> {
  data: T;
}

export interface SuccessResponse {
  success: boolean;
}
