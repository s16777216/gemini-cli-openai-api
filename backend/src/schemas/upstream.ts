import { z } from 'zod';

export const UpstreamCredentialSchema = z.object({
  id: z.string(),
  type: z.enum(['oauth2', 'api_key']),
  label: z.string(),
  // For OAuth2: JSON string containing client_id, client_secret, refresh_token
  // For API Key: The key string
  config: z.string(), 
  status: z.enum(['active', 'rate_limited', 'invalid']),
  weight: z.number().default(1),
  lastUsedAt: z.number().optional(),
  recoveryAt: z.number().optional(),
  createdAt: z.number(),
});

export type UpstreamCredential = z.infer<typeof UpstreamCredentialSchema>;

export interface OAuth2Config {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  project_id?: string;
  access_token?: string;
  expiry_date?: number;
}
