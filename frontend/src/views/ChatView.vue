<script setup lang="ts">
import { ref, nextTick, watch, computed, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Send, Bot, User, History, LogOut, Menu, Sparkles, Paperclip, Mic, Trash2, Key, Clock, Plus, Square
} from 'lucide-vue-next'
import MarkdownMessage from '@/components/MarkdownMessage.vue'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// AI SDK and state
import { Chat } from '@ai-sdk/vue'
import { OpenAIChatTransport } from '@/lib/openai-transport'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { getSessions, getSession, deleteSession as apiDeleteSession, getModels } from '@/lib/api'
import type { Session, Model } from '@/types/api'
import ApiKeyManager from '@/components/ApiKeyManager.vue'
import RadixAlertDialog from '@/components/RadixAlertDialog.vue'
import { useToastStore } from '@/stores/toast'

const authStore = useAuthStore()
const router = useRouter()
const toast = useToastStore()

const input = ref('')
const scrollContainer = ref<HTMLElement | null>(null)
const sessions = ref<Session[]>([])
const currentSessionId = ref<string | null>(null)
const isKeyModalOpen = ref(false)
const isHistoryLoading = ref(false)
const allModels = ref<Model[]>([])
const selectedModel = ref('gemini-2.5-flash')

// 刪除確認狀態
const isDeleteDialogOpen = ref(false)
const sessionIdToDelete = ref<string | null>(null)

// Vercel AI SDK Chat instance
const chat = new Chat({
  transport: new OpenAIChatTransport({
    api: '/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${authStore.token}`
    },
    body: {
      model: selectedModel.value,
      sessionId: currentSessionId.value
    },
    onFinish: () => {
      // 串流結束後重新獲取列表，以獲取自動產生的標題
      fetchSessions()
    }
  })
})

const isLoading = computed(() => chat.status === 'streaming' || chat.status === 'submitted' || isHistoryLoading.value)

// API Data Fetching
const fetchSessions = async () => {
  try {
    const res = await getSessions()
    sessions.value = res.data.data
  } catch (err) {
    console.error('Failed to fetch sessions:', err)
  }
}

const fetchModels = async () => {
  try {
    const res = await getModels()
    allModels.value = res.data.data
    // 如果目前選擇的模型不在清單中，設為第一個
    if (allModels.value.length > 0 && !allModels.value.find(m => m.id === selectedModel.value)) {
      selectedModel.value = allModels.value[0].id
    }
  } catch (err) {
    console.error('Failed to fetch models:', err)
  }
}

const loadSession = async (id: string) => {
  if (currentSessionId.value === id || isLoading.value) return
  isHistoryLoading.value = true
  try {
    const res = await getSession(id)
    currentSessionId.value = id
    // 將後端訊息格式轉為前端 UIMessage 格式
    chat.messages = res.data.data.messages?.map(m => ({
      id: String(m.id || Math.random()),
      role: m.role === 'ai' ? 'assistant' : 'user',
      parts: [{ type: 'text', text: m.content }]
    })) as any
    scrollToBottom()
  } catch (err) {
    console.error('Failed to load session:', err)
  } finally {
    isHistoryLoading.value = false
  }
}

const deleteChat = (id: string, event?: Event) => {
  event?.stopPropagation()
  sessionIdToDelete.value = id
  isDeleteDialogOpen.value = true
}

const confirmDeleteChat = async () => {
  if (!sessionIdToDelete.value) return
  try {
    await apiDeleteSession(sessionIdToDelete.value)
    if (currentSessionId.value === sessionIdToDelete.value) {
      startNewChat()
    }
    await fetchSessions()
    toast.success('對話紀錄已成功刪除')
  } catch (err) {
    console.error('Failed to delete session:', err)
    toast.error('無法刪除對話紀錄，請稍後再試')
  } finally {
    isDeleteDialogOpen.value = false
    sessionIdToDelete.value = null
  }
}

const startNewChat = () => {
  currentSessionId.value = null
  chat.messages = []
  input.value = ''
}

// Auto scroll logic
const scrollToBottom = async () => {
  await nextTick()
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
  }
}

// Watch messages to auto-scroll
watch(() => chat.messages, () => {
  scrollToBottom()
}, { deep: true })

// Session handling
const handleLogout = () => {
  authStore.clearToken()
  router.push('/login')
}

// Handle message submission
const handleSubmit = (e?: Event) => {
  e?.preventDefault()
  if (!input.value.trim() || isLoading.value) return

  chat.sendMessage({ text: input.value }, {
    body: { 
      sessionId: currentSessionId.value,
      model: selectedModel.value
    }
  })
  input.value = ''
}

const formatDate = (ts: number) => {
  const date = new Date(ts)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return `${date.getMonth() + 1}/${date.getDate()}`
}

onMounted(() => {
  fetchSessions()
  fetchModels()
})

// Handle Enter key for submission
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit(e)
  }
}
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

      <nav class="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">


        <Button @click="startNewChat" variant="ghost"
          class="w-full justify-start gap-3 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl transition-all mb-6 py-6 border border-primary/20">
          <Plus class="w-5 h-5" />
          開始新對話
        </Button>

        <div class="px-2 pb-2">
          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 px-1">最近對話</p>
          <div v-if="sessions.length === 0" class="py-10 text-center space-y-2 opacity-40">
            <Clock class="w-8 h-8 mx-auto" />
            <p class="text-xs">尚無歷史對話</p>
          </div>
          <div v-for="session in sessions" :key="session.id" @click="loadSession(session.id)"
            class="group w-full flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all hover:bg-accent relative"
            :class="currentSessionId === session.id ? 'bg-accent/80 border border-border shadow-sm' : ''">
            <History class="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <div class="flex-1 overflow-hidden">
              <p class="text-sm font-medium truncate">{{ session.title }}</p>
              <p class="text-[10px] text-muted-foreground">{{ formatDate(session.updatedAt) }}</p>
            </div>
            <Button variant="ghost" size="icon" @click="deleteChat(session.id, $event)"
              class="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive rounded-md">
              <Trash2 class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </nav>

      <div class="p-4 border-t border-border space-y-3">
        <Button @click="isKeyModalOpen = true" variant="ghost"
          class="w-full justify-start gap-3 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-all">
          <Key class="w-4 h-4 text-primary" />
          API Key 管理
        </Button>

        <div class="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border">
          <div class="w-9 h-9 rounded-full bg-primary flex items-center justify-center p-0.5">
            <div class="bg-background w-full h-full rounded-full flex items-center justify-center">
              <User class="w-4 h-4 text-primary" />
            </div>
          </div>
          <div class="flex-1 overflow-hidden">
            <p class="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter">Session Active</p>
            <p class="text-xs truncate font-mono opacity-80">{{ authStore.token.substring(0, 12) }}...</p>
          </div>
        </div>
        <Button @click="handleLogout" variant="ghost"
          class="w-full justify-start gap-3 text-destructive/80 hover:text-destructive hover:bg-destructive/10 rounded-md">
          <LogOut class="w-4 h-4" />
          登出主控台
        </Button>
      </div>
    </aside>

    <!-- Main Chat Area -->
    <main class="flex-1 flex flex-col relative bg-background">
      <!-- Mobile Header -->
      <header
        class="md:hidden h-14 border-b border-border px-4 flex items-center gap-4 bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <Button variant="ghost" size="icon" class="rounded-md">
          <Menu class="w-5 h-5" />
        </Button>
        <span class="font-bold text-primary">Gemini Pro</span>
      </header>

      <!-- Message List -->
      <div ref="scrollContainer"
        class="flex-1 overflow-y-auto p-4 md:px-12 md:py-8 space-y-8 scroll-smooth custom-scrollbar">
        <div v-if="chat.messages.length === 0" class="h-full flex flex-col items-center justify-center space-y-6 py-20">
          <div class="w-20 h-20 rounded-2xl bg-primary shadow-xl flex items-center justify-center">
            <Sparkles class="w-10 h-10 text-primary-foreground" />
          </div>
          <div class="text-center space-y-2 max-w-lg mx-auto">
            <h3 class="text-3xl font-bold tracking-tight">有什麼我能幫您的嗎？</h3>
            <p class="text-muted-foreground text-base">Gemini Pro API 代理主控台</p>
          </div>
        </div>

        <div v-for="(msg, idx) in chat.messages" :key="msg.id || idx"
          class="max-w-4xl mx-auto flex gap-5 group animate-in fade-in slide-in-from-bottom-3 duration-700"
          :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
          <div
            class="w-9 h-9 md:w-10 md:h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md"
            :class="msg.role === 'assistant' ? 'bg-primary' : 'bg-muted border border-border'">
            <Bot v-if="msg.role === 'assistant'" class="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
            <User v-else class="w-5 h-5 md:w-6 md:h-6 text-muted-foreground" />
          </div>

          <div class="flex-1 space-y-2" :class="msg.role === 'user' ? 'text-right' : ''">
            <div class="flex items-center gap-2 mb-1" :class="msg.role === 'user' ? 'flex-row-reverse' : ''">
              <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                {{ msg.role === 'assistant' ? 'Gemini Pro' : 'You' }}
              </span>
            </div>
            <div class="prose prose-invert max-w-none text-sm md:text-base leading-relaxed"
              :class="msg.role === 'assistant' ? 'text-foreground' : 'bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-none inline-block text-left shadow-sm whitespace-pre-wrap'">
              <template v-for="(part, pIdx) in msg.parts" :key="pIdx">
                <template v-if="part.type === 'text'">
                  <MarkdownMessage v-if="msg.role === 'assistant'" :content="part.text" :isLoading="isLoading && idx === chat.messages.length - 1" />
                  <span v-else>{{ part.text }}</span>
                </template>
              </template>
              <!-- 當助理訊息還沒有任何文字內容，且正在載入時，直接顯示思考狀態 -->
              <MarkdownMessage 
                v-if="msg.role === 'assistant' && isLoading && idx === chat.messages.length - 1 && !msg.parts.some(p => p.type === 'text' && p.text?.trim())" 
                content="" 
                :isLoading="true" 
              />
            </div>
          </div>
        </div>

        <!-- 幽靈訊息：當正在載入且最後一則訊息是使用者發送時，顯示思考狀態 -->
        <div v-if="isLoading && chat.messages.length > 0 && chat.messages[chat.messages.length - 1].role === 'user'"
          class="flex gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div class="w-9 h-9 md:w-10 md:h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden shadow-md bg-primary">
            <Bot class="w-5 h-5 md:w-6 md:h-6 text-primary-foreground" />
          </div>
          <div class="flex-1 space-y-2">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                Gemini Pro
              </span>
            </div>
            <div class="prose prose-invert max-w-none text-sm md:text-base leading-relaxed text-foreground">
              <MarkdownMessage content="" :isLoading="true" />
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="p-6 md:p-10 pt-0 max-w-5xl mx-auto w-full">
        <form @submit="handleSubmit" class="relative">
          <Card
            class="bg-card border-border border rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-2xl group pb-2">
            <div class="flex flex-col">
              <textarea v-model="input" rows="1" placeholder="與 Gemini 對話..."
                class="flex-1 bg-transparent border-none focus:ring-0 text-sm md:text-base px-5 py-4 resize-none max-h-60 custom-scrollbar outline-none placeholder:text-muted-foreground/50"
                @keydown="handleKeyDown"></textarea>

              <div class="flex items-center justify-between px-4 py-2 border-t border-border/30">
                <div class="flex items-center gap-1.5">
                  <Button type="button" variant="ghost" size="icon"
                    class="rounded-lg h-9 w-9 text-muted-foreground/60 hover:text-foreground">
                    <Paperclip class="w-4.5 h-4.5" />
                  </Button>
                  
                  <Select v-model="selectedModel">
                    <SelectTrigger class="h-8 w-fit bg-muted/40 border-none hover:bg-accent hover:text-primary transition-all rounded-full px-3 gap-2 text-[11px] font-bold text-muted-foreground ring-0 focus:ring-0 focus:ring-offset-0">
                      <Sparkles class="w-3 h-3 text-primary" />
                      <SelectValue placeholder="選擇模型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem v-for="m in allModels" :key="m.id" :value="m.id">
                          <div class="flex items-center gap-2 py-1">
                            <span class="text-[10px] text-muted-foreground/50 uppercase font-bold tracking-widest">{{ m.owned_by }}</span>
                            <span class="text-muted-foreground/30 text-xs">/</span>
                            <span class="font-bold text-sm tracking-tight">{{ m.id }}</span>
                          </div>
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div class="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="icon"
                    class="rounded-lg h-9 w-9 text-muted-foreground/60 hover:text-foreground hidden md:flex">
                    <Mic class="w-4.5 h-4.5" />
                  </Button>
                  <Button v-if="isLoading" type="button" size="icon" variant="ghost"
                    class="rounded-xl h-9 w-9 text-destructive hover:bg-destructive/10 transition-all border border-destructive/20"
                    @click="chat.stop()">
                    <div class="flex items-center justify-center">
                      <Square class="w-3.5 h-3.5 fill-current" />
                    </div>
                  </Button>
                  <Button v-else type="submit" size="icon"
                    class="rounded-xl h-9 w-9 bg-primary text-primary-foreground shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                    :disabled="!input.trim()">
                    <div class="flex items-center justify-center">
                      <Send class="w-4 h-4" />
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </form>
        <p
          class="text-[10px] text-center mt-5 text-muted-foreground/60 font-medium tracking-wide flex items-center justify-center gap-2">
          <span>Gemini Pro Console v1.0</span>
          <span class="w-1 h-1 rounded-full bg-border"></span>
          <span>Shadcn Zinc Theme</span>
        </p>
      </div>
    </main>

    <!-- API Key Manager Modal -->
    <ApiKeyManager :isOpen="isKeyModalOpen" @close="isKeyModalOpen = false" />

    <!-- 刪除確認彈窗 -->
    <RadixAlertDialog v-model:open="isDeleteDialogOpen" title="確認要刪除此對話嗎？" description="此操作將永久刪除該對話紀錄及其所有訊息內容，且無法復原。"
      actionText="確認刪除" variant="destructive" @action="confirmDeleteChat" />
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
