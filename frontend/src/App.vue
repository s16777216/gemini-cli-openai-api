<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useStorage } from '@vueuse/core'
import LoginView from '@/views/LoginView.vue'
import ChatView from '@/views/ChatView.vue'

const sessionKey = useStorage('gemini_playground_token', '')
const isAuthenticated = ref(false)

const checkAuth = () => {
  isAuthenticated.value = !!sessionKey.value
}

const handleLogin = () => {
  isAuthenticated.value = true
}

const handleLogout = () => {
  sessionKey.value = ''
  isAuthenticated.value = false
}

onMounted(() => {
  checkAuth()
})
</script>

<template>
  <div class="bg-gemini-bg min-h-screen text-gemini-text font-sans selection:bg-primary/30 selection:text-white">
    <transition name="fade" mode="out-in">
      <LoginView v-if="!isAuthenticated" @login="handleLogin" v-model:token="sessionKey" />
      <ChatView v-else :token="sessionKey" @logout="handleLogout" />
    </transition>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Global scrollbar for dark mode */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #444746;
  border-radius: 10px;
  border: 3px solid #131314;
}

::-webkit-scrollbar-thumb:hover {
  background: #5f6368;
}
</style>
