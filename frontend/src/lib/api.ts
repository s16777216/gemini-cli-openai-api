import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

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

// Response Interceptor for global error handling (Optional)
api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401) {
    const authStore = useAuthStore()
    authStore.clearToken()
    window.location.href = '/login'
  }
  return Promise.reject(error)
})

export default api
