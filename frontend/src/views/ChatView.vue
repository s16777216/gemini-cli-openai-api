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
  <div class="flex h-screen bg-background text-foreground overflow-hidden selection:bg-primary/20">
    <!-- Sidebar -->
    <aside class="w-72 bg-muted/30 border-r border-border flex flex-col hidden md:flex">
      <div class="p-6 flex items-center gap-3 border-b border-border">
        <div class="w-8 h-8 rounded-lg bg-primary shadow-lg flex items-center justify-center">
          <Sparkles class="w-5 h-5 text-primary-foreground" />
        </div>
        <span class="text-xl font-bold tracking-tight">Gemini Pro</span>
      </div>
      
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <Button @click="clearChat" variant="ghost" class="w-full justify-start gap-3 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-all">
          <Trash2 class="w-4 h-4 text-destructive" />
          清除對話
        </Button>
        <div class="pt-4 px-2">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">功能項目</p>
          <Button variant="ghost" class="w-full justify-start gap-3 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-all">
            <Sparkles class="w-4 h-4 text-primary" />
            新建模型會話
          </Button>
          <Button variant="ghost" class="w-full justify-start gap-3 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-all">
            <History class="w-4 h-4" />
            歷史對話
          </Button>
        </div>
      </nav>
      
      <div class="p-4 border-t border-border space-y-4">
        <div class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
          <div class="w-9 h-9 rounded-full bg-primary flex items-center justify-center p-0.5">
            <div class="bg-background w-full h-full rounded-full flex items-center justify-center">
              <User class="w-4 h-4 text-primary" />
            </div>
          </div>
          <div class="flex-1 overflow-hidden">
            <p class="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Session Active</p>
            <p class="text-xs truncate font-mono opacity-80">{{ props.token.substring(0, 12) }}...</p>
          </div>
        </div>
        <Button @click="handleLogout" variant="ghost" class="w-full justify-start gap-3 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-md">
          <LogOut class="w-4 h-4" />
          登出主控台
        </Button>
      </div>
    </aside>

    <!-- Main Chat Area -->
    <main class="flex-1 flex flex-col relative bg-background">
      <!-- Mobile Header -->
      <header class="md:hidden h-14 border-b border-border px-4 flex items-center gap-4 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <Button variant="ghost" size="icon" class="rounded-md">
          <Menu class="w-5 h-5" />
        </Button>
        <span class="font-bold text-primary">Gemini Pro</span>
      </header>

      <!-- Message List -->
      <div ref="scrollContainer" class="flex-1 overflow-y-auto p-4 md:px-12 md:py-8 space-y-8 scroll-smooth custom-scrollbar">
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center space-y-6 py-20">
          <div class="w-20 h-20 rounded-2xl bg-primary shadow-xl flex items-center justify-center">
            <Sparkles class="w-10 h-10 text-primary-foreground" />
          </div>
          <div class="text-center space-y-2 max-w-lg mx-auto">
            <h3 class="text-3xl font-bold tracking-tight">有什麼我能幫您的嗎？</h3>
            <p class="text-muted-foreground text-base">Gemini Pro API 代理主控台</p>
          </div>
        </div>

        <div v-for="(msg, idx) in messages" :key="idx" 
          class="max-w-4xl mx-auto flex gap-5 group animate-in fade-in slide-in-from-bottom-3 duration-700"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
        >
          <div class="w-9 h-9 md:w-10 md:h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md"
            :class="msg.role === 'assistant' ? 'bg-primary' : 'bg-muted border border-border'"
          >
            <Bot v-if="msg.role === 'assistant'" class="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
            <User v-else class="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
          </div>
          
          <div class="flex-1 space-y-2" :class="msg.role === 'user' ? 'text-right' : ''">
            <div class="flex items-center gap-2 mb-1" :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
              <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                {{ msg.role === 'assistant' ? 'Gemini Pro' : 'You' }}
              </span>
            </div>
            <div 
              class="prose prose-invert max-w-none text-sm md:text-base leading-relaxed whitespace-pre-wrap"
              :class="msg.role === 'assistant' ? 'text-foreground' : 'bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-none inline-block text-left shadow-sm'"
            >
              {{ msg.content }}
              <span v-if="isStreaming && idx === messages.length - 1 && msg.role === 'assistant'" class="inline-block w-2 h-4 bg-primary/80 ml-1 rounded-sm animate-pulse align-middle"></span>
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
        <Card class="bg-card border-border border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-xl group">
          <div class="flex items-end p-4 gap-2">
            <Button variant="ghost" size="icon" class="rounded-md h-10 w-10 text-muted-foreground hover:text-foreground">
              <Paperclip class="w-5 h-5" />
            </Button>
            
            <textarea 
              v-model="inputText"
              rows="1"
              placeholder="與 Gemini 對話..."
              class="flex-1 bg-transparent border-none focus:ring-0 text-sm md:text-base py-2.5 resize-none max-h-60 custom-scrollbar outline-none placeholder:text-muted-foreground"
              @keydown.enter.prevent="handleSend"
            ></textarea>
            
            <div class="flex items-center gap-2">
              <Button variant="ghost" size="icon" class="rounded-md h-10 w-10 text-muted-foreground hover:text-foreground hidden md:flex">
                <Mic class="w-5 h-5" />
              </Button>
              <Button 
                @click="handleSend"
                size="icon" 
                class="rounded-md h-10 w-10 bg-primary text-primary-foreground shadow-sm active:scale-95 transition-all disabled:opacity-50"
                :disabled="!inputText.trim() || isStreaming"
              >
                <div class="flex items-center justify-center">
                  <Send class="w-4 h-4" v-if="!isStreaming" />
                  <div class="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" v-else></div>
                </div>
              </Button>
            </div>
          </div>
        </Card>
        <p class="text-[10px] text-center mt-5 text-muted-foreground/60 font-medium tracking-wide flex items-center justify-center gap-2">
          <span>Gemini Pro Console v1.0</span>
          <span class="w-1 h-1 rounded-full bg-border"></span>
          <span>Shadcn Zinc Theme</span>
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
