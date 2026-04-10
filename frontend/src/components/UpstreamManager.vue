<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  X, Plus, Trash2, ShieldCheck, AlertCircle, Server, Loader2, Info
} from 'lucide-vue-next'
import { getUpstreams, createUpstream, deleteUpstream } from '@/lib/api'
import type { UpstreamCredential } from '@/types/api'
import RadixAlertDialog from '@/components/RadixAlertDialog.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])

const upstreams = ref<UpstreamCredential[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)

const newLabel = ref('')
const newConfig = ref('')
const newType = ref<'oauth2' | 'api_key'>('oauth2')

// 刪除確認狀態
const isDeleteDialogOpen = ref(false)
const idToDelete = ref<string | null>(null)

const fetchUpstreams = async () => {
  isLoading.value = true
  try {
    const res = await getUpstreams()
    upstreams.value = res.data.data
  } catch (err) {
    console.error('Failed to fetch upstreams:', err)
  } finally {
    isLoading.value = false
  }
}

const handleAddUpstream = async () => {
  if (!newLabel.value.trim() || !newConfig.value.trim() || isSubmitting.value) return
  
  // 嘗試驗證 JSON 格式
  if (newType.value === 'oauth2') {
    try {
      JSON.parse(newConfig.value)
    } catch (e) {
      toast.error('無效的 JSON 格式')
      return
    }
  }

  isSubmitting.value = true
  try {
    await createUpstream({
      label: newLabel.value,
      config: newConfig.value,
      type: newType.value,
      weight: 1
    })
    toast.success(`成功新增上游憑證: ${newLabel.value}`)
    newLabel.value = ''
    newConfig.value = ''
    await fetchUpstreams()
  } catch (err) {
    console.error('Failed to add upstream:', err)
    toast.error('新增上游憑證失敗')
  } finally {
    isSubmitting.value = false
  }
}

const handleOAuthLogin = () => {
  // 導向後端 OAuth 登入入口
  window.location.href = '/v1/admin/auth/login'
}

const handleDeleteUpstream = (id: string) => {
  idToDelete.value = id
  isDeleteDialogOpen.value = true
}

const confirmDeleteUpstream = async () => {
  if (!idToDelete.value) return
  try {
    await deleteUpstream(idToDelete.value)
    toast.success('上游憑證已刪除')
    await fetchUpstreams()
  } catch (err) {
    console.error('Failed to delete upstream:', err)
    toast.error('刪除失敗')
  } finally {
    isDeleteDialogOpen.value = false
    idToDelete.value = null
  }
}

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  if (props.isOpen) fetchUpstreams()
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) fetchUpstreams()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <Card class="w-full max-w-3xl bg-card border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div class="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg">
              <Server class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 class="text-xl font-bold tracking-tight">上游憑證 (Upstream) 管理</h2>
              <p class="text-xs text-muted-foreground">配置轉發請求至 Google API 所需的 OAuth2 或 API Key</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" @click="emit('close')" class="rounded-full">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
          <!-- Add Form -->
          <div class="space-y-4 p-4 border border-border bg-muted/10 rounded-xl">
            <h3 class="text-sm font-bold flex items-center gap-2">
              <Plus class="w-4 h-4" /> 新增上游帳號
            </h3>
            
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label class="text-[10px] font-bold uppercase text-muted-foreground">備註名稱</label>
                <Input v-model="newLabel" placeholder="例如：我的 Google 帳號 1" />
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-bold uppercase text-muted-foreground">憑證類型</label>
                <select v-model="newType" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <option value="oauth2">OAuth2 (JSON)</option>
                  <option value="api_key">API Key (String)</option>
                </select>
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-[10px] font-bold uppercase text-muted-foreground">憑證配置 (Config)</label>
              <Textarea v-model="newConfig" 
                :placeholder="newType === 'oauth2' ? '請貼入包含 refresh_token 的 JSON...' : '請貼入 API Key 字串...'"
                rows="4" class="font-mono text-xs bg-background" />
              <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 mt-1">
                <Info class="w-3 h-3" />
                <span v-if="newType === 'oauth2'">OAuth2 需要包含 client_id, client_secret, refresh_token</span>
                <span v-else>直接輸入 Google AI Studio 的 API Key</span>
              </div>
            </div>

            <div v-if="newType === 'oauth2'" class="space-y-4 pt-2">
              <div class="relative">
                <div class="absolute inset-0 flex items-center">
                  <span class="w-full border-t border-border/50"></span>
                </div>
                <div class="relative flex justify-center text-[10px] uppercase">
                  <span class="bg-background px-2 text-muted-foreground">或使用自動授權</span>
                </div>
              </div>

              <Button @click="handleOAuthLogin" variant="outline" class="w-full h-11 gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5">
                <img src="https://www.google.com/favicon.ico" class="w-4 h-4 opacity-80" />
                Google 帳號登入 (自動取得 Token)
              </Button>
            </div>

            <Button @click="handleAddUpstream" class="w-full h-11 gap-2" :disabled="isSubmitting">
              <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
              <Plus v-else class="w-4 h-4" />
              儲存至憑證池
            </Button>
          </div>

          <!-- List -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">憑證池狀態 ({{ upstreams.length }})</label>
              <Button variant="ghost" size="sm" @click="fetchUpstreams" class="text-[10px] h-7">重新整理</Button>
            </div>

            <div v-if="isLoading && upstreams.length === 0" class="py-12 flex flex-col items-center justify-center">
              <Loader2 class="w-8 h-8 animate-spin opacity-20" />
            </div>

            <div v-else-if="upstreams.length === 0" class="py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground gap-2">
              <AlertCircle class="w-8 h-8 opacity-20" />
              <p class="text-sm">目前沒有配置任何上游憑證</p>
            </div>

            <div v-else class="grid grid-cols-1 gap-3">
              <div v-for="item in upstreams" :key="item.id"
                class="p-4 bg-muted/30 border border-border rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <div class="p-2.5 bg-background rounded-lg border border-border shadow-sm">
                    <ShieldCheck v-if="item.status === 'active'" class="w-5 h-5 text-green-500" />
                    <AlertCircle v-else class="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-sm">{{ item.label }}</span>
                      <span class="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase">
                        {{ item.type }}
                      </span>
                    </div>
                    <div class="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span>狀態：{{ item.status }}</span>
                      <span v-if="item.lastUsedAt">上次使用：{{ formatDate(item.lastUsedAt) }}</span>
                    </div>
                  </div>
                </div>
                <Button @click="handleDeleteUpstream(item.id)" variant="ghost" size="icon" class="text-muted-foreground hover:text-destructive">
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div class="p-4 bg-muted/10 border-t border-border flex justify-end">
          <Button variant="outline" @click="emit('close')">關閉</Button>
        </div>
      </Card>
    </div>
  </Teleport>

  <RadixAlertDialog v-model:open="isDeleteDialogOpen" title="確認刪除上游憑證？"
    description="刪除後，該帳號將不再參與負載均衡調度。" actionText="確認刪除" variant="destructive"
    @action="confirmDeleteUpstream" />
</template>
