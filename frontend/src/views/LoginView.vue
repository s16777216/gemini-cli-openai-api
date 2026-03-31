<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User, Lock, ShieldCheck } from 'lucide-vue-next'
import api from '@/lib/api'

const authStore = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) return
  
  isLoading.value = true
  error.value = ''
  
  try {
    const res = await api.post('/admin/login', {
      username: username.value, 
      password: password.value 
    })

    authStore.setToken(res.data.token) // 存入全域 Store
    router.push('/chat') // 跳轉至對話頁面
  } catch (e: any) {
    console.error('Login error:', e)
    error.value = e.response?.data?.message || '登入失敗，請檢查帳號密碼'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <Card class="max-w-md w-full border-border bg-card shadow-xl">
      <CardHeader class="text-center space-y-4">
        <div class="mx-auto w-16 h-16 rounded-xl bg-primary flex items-center justify-center shadow-lg animate-in zoom-in duration-700">
          <ShieldCheck class="w-8 h-8 text-primary-foreground" />
        </div>
        <CardTitle class="text-3xl font-bold tracking-tight">
          Gemini Pro Console
        </CardTitle>
        <CardDescription class="text-muted-foreground text-base">
          請登入以存取管理員主控台
        </CardDescription>
      </CardHeader>
      
      <CardContent class="mt-4">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div v-if="error" class="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in slide-in-from-top-1">
            {{ error }}
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground ml-1">使用者名稱</label>
            <div class="relative group">
              <User class="absolute left-3 top-3 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                v-model="username"
                type="text" 
                placeholder="Username" 
                required
                class="pl-10 h-11 bg-background border-input focus:border-primary transition-all duration-300"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground ml-1">密碼</label>
            <div class="relative group">
              <Lock class="absolute left-3 top-3 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                v-model="password"
                type="password" 
                placeholder="Password" 
                required
                class="pl-10 h-11 bg-background border-input focus:border-primary transition-all duration-300"
              />
            </div>
          </div>
          
          <Button 
            type="submit"
            variant="default" 
            :disabled="isLoading"
            class="w-full h-11 text-base font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] mt-4"
          >
            <span v-if="isLoading">登入中...</span>
            <span v-else>啟動主控台</span>
          </Button>
        </form>
      </CardContent>
      
      <CardFooter class="justify-center pt-6 border-t border-border mt-8">
        <p class="text-xs text-muted-foreground">
          您的安全憑證僅儲存在本地瀏覽器
        </p>
      </CardFooter>
    </Card>
  </div>
</template>

<style scoped>
.animate-in {
  animation-fill-mode: forwards;
}
</style>
