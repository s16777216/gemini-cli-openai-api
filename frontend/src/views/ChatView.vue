<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { 
  Send, Bot, User, History, LogOut, Menu, Sparkles, Paperclip, Mic, Trash2
} from 'lucide-vue-next'

// Session and state
const props = defineProps<{
  token: string
  onLogout?: () => void
}>()

const messages = ref<{ role: string, content: string }[]>([])
const inputText = ref('')
const isStreaming = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)

// Auto scroll logic
const scrollToBottom = async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

// Session handling
const handleLogout = () => {
  if (props.onLogout) {
    props.onLogout()
  } else {
    window.location.reload()
  }
}

const clearChat = () => {
  messages.value = []
}

// SSE Streaming Logic
const handleSend = async () => {
  if (!inputText.value.trim() || isStreaming.value) return
  
  const userMessage = inputText.value.trim()
  messages.value.push({ role: 'user', content: userMessage })
  inputText.value = ''
  scrollToBottom()
  
  isStreaming.value = true
  messages.value.push({ role: 'assistant', content: '' })
  
  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${props.token}`
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: messages.value.slice(0, -1), // Send history, exclude the empty assistant message
        stream: true
      })
    })

    if (!response.ok) throw new Error('API 請求失敗')
    
    const reader = response.body?.getReader()
    if (!reader) throw new Error('無法讀取串流數據')

    const decoder = new TextDecoder()
    let buffer = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue
        
        const dataStr = trimmedLine.replace('data: ', '')
        if (dataStr === '[DONE]') {
          isStreaming.value = false
          break
        }

        try {
          const json = JSON.parse(dataStr)
          const content = json.choices[0]?.delta?.content || ''
          if (content) {
            messages.value[messages.value.length - 1].content += content
            scrollToBottom()
          }
        } catch (e) {
          console.warn('JSON 解析失敗:', e)
        }
      }
    }
  } catch (error) {
    console.error('串流對話出錯:', error)
    messages.value[messages.value.length - 1].content = '發生錯誤，請稍後再試。'
  } finally {
    isStreaming.value = false
  }
}

// Listen for paste to auto-grow? (Optional enhancement)
</script>

<template>
  <div class="flex h-screen bg-gemini-bg text-gemini-text overflow-hidden selection:bg-primary/20">
    <!-- Sidebar (Same as before) -->
    <aside class="w-72 bg-gemini-side border-r border-gemini-border flex flex-col hidden md:flex">
      <div class="p-6 flex items-center gap-3 border-b border-gemini-border/30">
        <div class="w-8 h-8 rounded-lg gemini-gradient shadow-xl"></div>
        <span class="text-xl font-bold tracking-tight">Gemini Pro</span>
      </div>
      
      <nav class="flex-1 overflow-y-auto p-4 space-y-2">
        <Button @click="clearChat" variant="ghost" class="w-full justify-start gap-4 hover:bg-gemini-hover rounded-xl text-gemini-sec hover:text-white transition-all h-12">
          <Trash2 class="w-4 h-4 text-destructive" />
          清除對話
        </Button>
        <div class="pt-4 px-2">
          <p class="text-[10px] font-bold text-gemini-border uppercase tracking-widest mb-3 px-2">功能項目</p>
          <Button variant="ghost" class="w-full justify-start gap-4 hover:bg-gemini-hover rounded-xl text-gemini-sec hover:text-white transition-all h-11">
            <Sparkles class="w-4 h-4 text-primary" />
            新建模型會話
          </Button>
          <Button variant="ghost" class="w-full justify-start gap-4 hover:bg-gemini-hover rounded-xl text-gemini-sec hover:text-white transition-all h-11">
            <History class="w-4 h-4" />
            歷史對話
          </Button>
        </div>
      </nav>
      
      <div class="p-6 border-t border-gemini-border/30 space-y-4">
        <div class="flex items-center gap-4 px-3 py-3 bg-gemini-hover/50 rounded-2xl border border-gemini-border/20 backdrop-blur-md">
          <div class="w-10 h-10 rounded-full gemini-gradient flex items-center justify-center p-0.5">
            <div class="bg-gemini-side w-full h-full rounded-full flex items-center justify-center">
              <User class="w-5 h-5 text-primary" />
            </div>
          </div>
          <div class="flex-1 overflow-hidden">
            <p class="text-xs text-gemini-sec font-medium">Session Active</p>
            <p class="text-xs truncate font-mono text-white/70">{{ props.token.substring(0, 16) }}...</p>
          </div>
        </div>
        <Button @click="handleLogout" variant="ghost" class="w-full justify-start gap-4 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-xl h-11">
          <LogOut class="w-4 h-4" />
          登出主控台
        </Button>
      </div>
    </aside>

    <!-- Main Chat Area -->
    <main class="flex-1 flex flex-col relative bg-[radial-gradient(circle_at_50%_0%,#1e1f20_0%,#131314_100%)]">
      <!-- Mobile Header -->
      <header class="md:hidden h-14 border-b border-gemini-border px-4 flex items-center gap-4 bg-gemini-bg/50 backdrop-blur-xl sticky top-0 z-50">
        <Button variant="ghost" size="icon" class="rounded-xl">
          <Menu class="w-5 h-5" />
        </Button>
        <span class="font-bold gemini-text-gradient">Gemini Pro</span>
      </header>

      <!-- Message List -->
      <div ref="scrollContainer" class="flex-1 overflow-y-auto p-4 md:px-12 md:py-8 space-y-8 scroll-smooth custom-scrollbar">
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center space-y-8 py-20">
          <div class="w-24 h-24 rounded-[2.5rem] gemini-gradient shadow-2xl animate-pulse flex items-center justify-center group">
            <Sparkles class="w-12 h-12 text-white group-hover:scale-110 transition-transform" />
          </div>
          <div class="text-center space-y-3 max-w-lg mx-auto">
            <h3 class="text-4xl font-bold tracking-tight text-white">您好，有什麼我能幫您的嗎？</h3>
            <p class="text-gemini-sec text-lg">我是 Gemini Pro，專為您的專案設計的 API 代理主控台。</p>
          </div>
        </div>

        <div v-for="(msg, idx) in messages" :key="idx" 
          class="max-w-4xl mx-auto flex gap-5 group animate-in fade-in slide-in-from-bottom-3 duration-700"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <div class="w-9 h-9 md:w-11 md:h-11 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden shadow-lg transition-transform group-hover:scale-105"
            :class="msg.role === 'assistant' ? 'gemini-gradient' : 'bg-gemini-hover border border-gemini-border'"
          >
            <Bot v-if="msg.role === 'assistant'" class="w-5 h-5 md:w-6 md:h-6 text-white" />
            <User v-else class="w-5 h-5 md:w-6 md:h-6 text-gemini-sec" />
          </div>
          
          <div class="flex-1 space-y-3" :class="msg.role === 'user' ? 'text-right' : ''">
            <div class="flex items-center gap-2 mb-1" :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
              <span class="text-xs font-bold uppercase tracking-widest text-gemini-border">
                {{ msg.role === 'assistant' ? 'Gemini Pro' : 'You' }}
              </span>
            </div>
            <div 
              class="prose prose-invert max-w-none text-sm md:text-lg leading-relaxed whitespace-pre-wrap selection:bg-white/20"
              :class="msg.role === 'assistant' ? 'text-gemini-text pl-1' : 'bg-gemini-hover/80 px-5 py-4 rounded-[1.5rem] inline-block text-left border border-white/5 backdrop-blur-sm'"
            >
              {{ msg.content }}
              <span v-if="isStreaming && idx === messages.length - 1 && msg.role === 'assistant'" class="inline-block w-2 h-6 bg-primary/80 ml-1 rounded-sm animate-pulse align-middle"></span>
              <div v-if="!msg.content && isStreaming && idx === messages.length - 1" class="flex gap-1.5 py-2">
                 <div class="w-2 h-2 rounded-full bg-primary/40 animate-bounce delay-75"></div>
                 <div class="w-2 h-2 rounded-full bg-primary/40 animate-bounce delay-150"></div>
                 <div class="w-2 h-2 rounded-full bg-primary/40 animate-bounce delay-300"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="p-6 md:p-10 pt-0 max-w-5xl mx-auto w-full">
        <Card class="bg-gemini-side/80 border-gemini-border/40 border-2 rounded-[2.5rem] overflow-hidden focus-within:border-primary/40 transition-all shadow-2xl backdrop-blur-3xl group">
          <div class="flex items-end p-5 gap-3">
            <Button variant="ghost" size="icon" class="rounded-full h-12 w-12 text-gemini-sec hover:text-white hover:bg-white/5 transition-all">
              <Paperclip class="w-6 h-6 rotate-12" />
            </Button>
            
            <textarea 
              v-model="inputText"
              rows="1"
              placeholder="與 Gemini 對話..."
              class="flex-1 bg-transparent border-none focus:ring-0 text-base md:text-lg py-3 resize-none max-h-60 custom-scrollbar outline-none placeholder:text-gemini-border text-white selection:bg-white/20"
              @keydown.enter.prevent="handleSend"
            ></textarea>
            
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="icon" class="rounded-full h-12 w-12 text-gemini-sec hover:text-white hove:bg-white/5 hidden md:flex">
                <Mic class="w-6 h-6" />
              </Button>
              <Button 
                @click="handleSend"
                size="icon" 
                class="rounded-full h-12 w-12 gemini-gradient text-white shadow-xl active:scale-95 transition-all disabled:opacity-30 disabled:grayscale hover:brightness-110"
                :disabled="!inputText.trim() || isStreaming"
              >
                <div class="flex items-center justify-center">
                  <Send class="w-5 h-5 ml-1" v-if="!isStreaming" />
                  <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" v-else></div>
                </div>
              </Button>
            </div>
          </div>
        </Card>
        <p class="text-[11px] text-center mt-5 text-gemini-border font-medium tracking-wide flex items-center justify-center gap-2">
          <span>Gemini Pro Console v1.0</span>
          <span class="w-1 h-1 rounded-full bg-gemini-border"></span>
          <span>基於 Vue 3 & shadcn-vue</span>
        </p>
      </div>
    </main>
  </div>
</template>

<style>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #44474666;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.prose {
  color: inherit;
  font-family: inherit;
}
</style>
