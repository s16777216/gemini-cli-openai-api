import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import LoginView from '../views/LoginView.vue'
import ChatView from '../views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/chat'
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false }
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView,
      meta: { requiresAuth: true }
    }
  ]
})

// 🚀 導航守衛：實作「未登入強制回登入頁」與「已登入跳過登入頁」
router.beforeEach((to, _, next) => {
  const authStore = useAuthStore()
  const isAuthenticated = authStore.isAuthenticated

  if (to.meta.requiresAuth && !isAuthenticated) {
    // 未登入，嘗試進入受保護頁面 -> 跳轉登入
    next('/login')
  } else if (to.name === 'login' && isAuthenticated) {
    // 已登入，嘗試進入登入頁面 -> 直接跳轉對話
    next('/chat')
  } else {
    // 其他情況放行
    next()
  }
})

export default router
