<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  X, Plus, Trash2, Copy, CheckCircle2, AlertCircle, Key, Loader2
} from 'lucide-vue-next'
import { getApiKeys, createApiKey, revokeApiKey } from '@/lib/api'
import type { ApiKey } from '@/types/api'
import RadixAlertDialog from '@/components/RadixAlertDialog.vue'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

const props = defineProps({
  isOpen: Boolean
})

const emit = defineEmits(['close'])

const keys = ref<ApiKey[]>([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const newKeyLabel = ref('')
const copiedId = ref<string | null>(null)

// 撤銷確認狀態
const isRevokeDialogOpen = ref(false)
const keyIdToRevoke = ref<string | null>(null)

const fetchKeys = async () => {
  isLoading.value = true
  try {
    const res = await getApiKeys()
    keys.value = res.data.data
  } catch (err) {
    console.error('Failed to fetch keys:', err)
  } finally {
    isLoading.value = false
  }
}

const handleAddKey = async () => {
  if (!newKeyLabel.value.trim() || isSubmitting.value) return
  isSubmitting.value = true
  try {
    await createApiKey(newKeyLabel.value)
    toast.success(`成功建立金鑰: ${newKeyLabel.value}`)
    newKeyLabel.value = ''
    await fetchKeys()
  } catch (err) {
    console.error('Failed to add key:', err)
    toast.error('建立金鑰失敗')
  } finally {
    isSubmitting.value = false
  }
}

const handleRevokeKey = (id: string) => {
  keyIdToRevoke.value = id
  isRevokeDialogOpen.value = true
}

const confirmRevokeKey = async () => {
  if (!keyIdToRevoke.value) return
  try {
    await revokeApiKey(keyIdToRevoke.value)
    toast.success('金鑰已成功撤銷')
    await fetchKeys()
  } catch (err) {
    console.error('Failed to revoke key:', err)
    toast.error('撤銷金鑰失敗')
  } finally {
    isRevokeDialogOpen.value = false
    keyIdToRevoke.value = null
  }
}

const copyToClipboard = (text: string, id: string) => {
  navigator.clipboard.writeText(text)
  copiedId.value = id
  toast.success('Token 已複製到剪貼簿', 2000)
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleString()
}

onMounted(() => {
  if (props.isOpen) fetchKeys()
})

watch(() => props.isOpen, (newVal) => {
  if (newVal) fetchKeys()
})

defineExpose({ fetchKeys })
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <Card class="w-full max-w-2xl bg-card border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div class="p-6 border-b border-border flex items-center justify-between bg-muted/20">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg">
              <Key class="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 class="text-xl font-bold tracking-tight">API Key 管理</h2>
              <p class="text-xs text-muted-foreground">管理用於訪問代理伺服器的金鑰</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" @click="emit('close')" class="rounded-full">
            <X class="w-5 h-5" />
          </Button>
        </div>

        <div class="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-6">
          <!-- Add Key Form -->
          <div class="space-y-3">
            <label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">建立新金鑰</label>
            <div class="flex gap-2">
              <Input v-model="newKeyLabel" placeholder="金鑰標籤 (例如：開發用、測試手機...)" @keyup.enter="handleAddKey"
                class="bg-muted/50 border-border focus-visible:ring-primary/20" />
              <Button @click="handleAddKey" :disabled="!newKeyLabel.trim() || isSubmitting" class="gap-2">
                <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
                <Plus v-else class="w-4 h-4" />
                建立
              </Button>
            </div>
          </div>

          <!-- Key List -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">現有金鑰 ({{ keys.length
                }})</label>
              <Button variant="ghost" size="sm" @click="fetchKeys" class="text-[10px] h-7 px-2">重新整理</Button>
            </div>

            <div v-if="isLoading && keys.length === 0"
              class="py-12 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Loader2 class="w-8 h-8 animate-spin opacity-20" />
              <p class="text-sm">載入中...</p>
            </div>

            <div v-else-if="keys.length === 0"
              class="py-12 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground gap-3">
              <AlertCircle class="w-8 h-8 opacity-20" />
              <p class="text-sm">目前沒有任何 API Key</p>
            </div>

            <div v-else class="space-y-3">
              <div v-for="key in keys" :key="key.id"
                class="group p-4 bg-muted/30 hover:bg-muted/50 border border-border rounded-xl transition-all relative overflow-hidden"
                :class="key.status === 'revoked' ? 'opacity-60 grayscale' : ''">

                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm">{{ key.label }}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter"
                      :class="key.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'">
                      {{ key.status === 'active' ? '使用中' : '已撤銷' }}
                    </span>
                  </div>
                  <Button v-if="key.status === 'active'" @click="handleRevokeKey(key.id)" variant="ghost" size="icon"
                    class="h-8 w-8 text-muted-foreground hover:text-destructive rounded-lg">
                    <Trash2 class="w-4 h-4" />
                  </Button>
                </div>

                <div
                  class="flex items-center gap-2 bg-background/50 p-2.5 rounded-lg border border-border border-dashed font-mono text-xs overflow-hidden group-hover:border-primary/30 transition-colors">
                  <span class="truncate flex-1 opacity-70">{{ key.token }}</span>
                  <Button @click="copyToClipboard(key.token, key.id)" variant="ghost" size="icon"
                    class="h-7 w-7 rounded-md">
                    <CheckCircle2 v-if="copiedId === key.id" class="w-3.5 h-3.5 text-green-500" />
                    <Copy v-else class="w-3.5 h-3.5" />
                  </Button>
                </div>

                <p class="mt-2 text-[10px] text-muted-foreground/60 tracking-tight">建立於：{{ formatDate(key.createdAt) }}
                </p>
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

  <!-- 撤銷確認彈窗 -->
  <RadixAlertDialog v-model:open="isRevokeDialogOpen" title="確定要撤銷此 API Key 嗎？"
    description="撤銷後，使用該金鑰的應用程式將立即無法訪問代理伺服器。此操作不可逆。" actionText="確認撤銷" variant="destructive"
    @action="confirmRevokeKey" />
</template>
