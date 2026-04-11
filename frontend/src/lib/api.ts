import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import type { Session, ApiKey, ApiResponse, SuccessResponse, Model, UpstreamCredential } from '../types/api'

const api = axios.create({
  baseURL: '/v1',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request Interceptor to add Authorization header
api.interceptors.request.use((config) => {
  const authStore = useAuthStore()
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  return config
}, (error) => {
  return Promise.reject(error)
})

// Response Interceptor for global error handling
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) {
    const authStore = useAuthStore()
    authStore.clearToken()
    window.location.href = '/login'
  }
  return Promise.reject(error)
})

/**
 * Session API
 */
export const getSessions = () => api.get<ApiResponse<Session[]>>('/sessions')
export const getSession = (id: string) => api.get<ApiResponse<Session>>(`/sessions/${id}`)
export const deleteSession = (id: string) => api.delete<SuccessResponse>(`/sessions/${id}`)
export const deleteAllSessions = () => api.delete<SuccessResponse>('/sessions')

/**
 * API Key Management API
 */
export const getApiKeys = () => api.get<ApiResponse<ApiKey[]>>('/admin/keys')
export const createApiKey = (label: string) => api.post<ApiResponse<ApiKey>>('/admin/keys', { label })
export const revokeApiKey = (id: string) => api.delete<SuccessResponse>(`/admin/keys/${id}`)

/**
 * Upstream Credential Management API
 */
export const getUpstreams = () => api.get<ApiResponse<UpstreamCredential[]>>('/admin/upstreams')
export const createUpstream = (data: Partial<UpstreamCredential>) => api.post<ApiResponse<UpstreamCredential>>('/admin/upstreams', data)
export const deleteUpstream = (id: string) => api.delete<SuccessResponse>(`/admin/upstreams/${id}`)

/**
 * Model API
 */
export const getModels = () => api.get<ApiResponse<Model[]>>('/models')
export const getDashboardStats = () => api.get<ApiResponse<any>>('/admin/stats')

export default api
