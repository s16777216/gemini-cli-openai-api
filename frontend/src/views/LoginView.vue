<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User, Lock, ShieldCheck } from 'lucide-vue-next'

const token = defineModel('token', { type: String })
const emit = defineEmits(['login'])
const username = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) return
  
  isLoading.value = true
  error.value = ''
  
  try {
    const res = await fetch('/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: username.value, 
        password: password.value 
      })
    })

    if (res.ok) {
      const data = await res.json()
      token.value = data.token
      emit('login')
    } else {
      const err = await res.json().catch(() => ({}))
      error.value = err.message || '登入失敗，請檢查帳號密碼'
    }
  } catch (e) {
    error.value = '連線失敗，請檢查後端服務'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gemini-bg p-4 bg-[radial-gradient(circle_at_50%_10%,#1e1f20_0%,#131314_100%)]">
    <Card class="max-w-md w-full border-none bg-transparent shadow-2xl">
      <CardHeader class="text-center space-y-4">
        <div class="mx-auto w-16 h-16 rounded-2xl gemini-gradient flex items-center justify-center shadow-lg animate-in zoom-in duration-700">
          <ShieldCheck class="w-8 h-8 text-white" />
        </div>
        <CardTitle class="text-4xl font-bold gemini-text-gradient tracking-tight">
          Gemini Pro Console
        </CardTitle>
        <CardDescription class="text-gemini-sec text-base">
          請登入以存取 Gemini Pro Console 代理
        </CardDescription>
      </CardHeader>
      
      <CardContent class="mt-4">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div v-if="error" class="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in slide-in-from-top-1">
            {{ error }}
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gemini-sec ml-1">使用者名稱</label>
            <div class="relative group">
              <User class="absolute left-3 top-3 w-4 h-4 text-gemini-border group-focus-within:text-white transition-colors" />
              <Input 
                v-model="username"
                type="text" 
                placeholder="Username" 
                required
                class="pl-10 h-12 bg-gemini-hover border-gemini-border focus:ring-gemini-gradient transition-all duration-300 rounded-xl"
              />
            </div>
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium text-gemini-sec ml-1">密碼</label>
            <div class="relative group">
              <Lock class="absolute left-3 top-3 w-4 h-4 text-gemini-border group-focus-within:text-white transition-colors" />
              <Input 
                v-model="password"
                type="password" 
                placeholder="Password" 
                required
                class="pl-10 h-12 bg-gemini-hover border-gemini-border focus:ring-gemini-gradient transition-all duration-300 rounded-xl"
              />
            </div>
          </div>
          
          <Button 
            type="submit"
            variant="gemini" 
            :disabled="isLoading"
            class="w-full h-12 text-lg font-bold rounded-xl shadow-lg hover:shadow-primary/20 transition-all active:scale-[0.98] mt-4"
          >
            <span v-if="isLoading">登入中...</span>
            <span v-else>啟動主控台</span>
          </Button>
        </form>
      </CardContent>
      
      <CardFooter class="justify-center pt-8 border-t border-gemini-border/30 mt-6">
        <p class="text-xs text-gemini-border">
          您的金鑰僅儲存在本地瀏覽器
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
