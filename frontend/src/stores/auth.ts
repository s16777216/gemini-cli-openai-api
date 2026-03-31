import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  // 使用 useStorage 保持持久化，與原本 App.vue 邏輯一致
  const token = useStorage('gemini_playground_token', '')

  const isAuthenticated = computed(() => !!token.value)

  function setToken(newToken: string) {
    token.value = newToken
  }

  function clearToken() {
    token.value = ''
  }

  return {
    token,
    isAuthenticated,
    setToken,
    clearToken
  }
})
