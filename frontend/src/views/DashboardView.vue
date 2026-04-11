<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Activity, Shield, Users, MessageSquare, AlertCircle, RefreshCcw, 
  CheckCircle2, Clock, Server, ArrowLeft, Bot, Sparkles, Key
} from 'lucide-vue-next'
import { getDashboardStats } from '@/lib/api'
import { useRouter } from 'vue-router'

const router = useRouter()
const stats = ref<any>(null)
const isLoading = ref(true)
const lastUpdated = ref(new Date())

const fetchStats = async () => {
  isLoading.value = true
  try {
    const res = await getDashboardStats()
    stats.value = res.data.data
    lastUpdated.value = new Date()
  } catch (err) {
    console.error('Failed to fetch dashboard stats:', err)
  } finally {
    isLoading.value = false
  }
}

// 每 10 秒自動刷新一次以更新倒數計時
let timer: any = null
onMounted(() => {
  fetchStats()
  timer = setInterval(fetchStats, 10000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const formatTime = (ms: number | null) => {
  if (!ms) return '-'
  const remaining = ms - Date.now()
  if (remaining <= 0) return 'Ready'
  const seconds = Math.floor(remaining / 1000)
  return `${seconds}s`
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active': return 'text-green-500'
    case 'rate_limited': return 'text-amber-500'
    case 'invalid': return 'text-red-500'
    default: return 'text-gray-500'
  }
}
</script>

<template>
  <div class="min-h-screen bg-background p-6">
    <div class="max-w-6xl mx-auto space-y-8">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" @click="router.push('/chat')">
            <ArrowLeft class="w-5 h-5" />
          </Button>
          <div>
            <h1 class="text-3xl font-bold tracking-tight">系統儀表板</h1>
            <p class="text-muted-foreground">即時監控憑證池健康度與系統使用狀況</p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right hidden sm:block">
            <p class="text-xs text-muted-foreground uppercase tracking-wider font-semibold">最後更新</p>
            <p class="text-sm font-mono">{{ lastUpdated.toLocaleTimeString() }}</p>
          </div>
          <Button @click="fetchStats" :disabled="isLoading" variant="outline" size="sm" class="gap-2 h-10 px-4">
            <RefreshCcw class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
            手動刷新
          </Button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card class="relative overflow-hidden group">
          <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle class="text-sm font-medium">總憑證數</CardTitle>
            <Server class="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats?.upstreams?.total || 0 }}</div>
            <p class="text-xs text-muted-foreground">已註冊的上游帳號池</p>
          </CardContent>
          <div class="absolute bottom-0 left-0 h-1 bg-primary/20 w-full"></div>
        </Card>

        <Card class="relative overflow-hidden group">
          <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle class="text-sm font-medium">健康帳號 (可用)</CardTitle>
            <Activity class="w-4 h-4 text-green-500 group-hover:animate-pulse" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats?.upstreams?.active || 0 }}</div>
            <div class="flex items-center gap-2 mt-2">
               <div class="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
                <div class="h-full bg-green-500 transition-all duration-1000" 
                     :style="{ width: `${(stats?.upstreams?.active / (stats?.upstreams?.total || 1) * 100) || 0}%` }"></div>
              </div>
              <span class="text-xs font-mono font-medium">{{ Math.round((stats?.upstreams?.active / (stats?.upstreams?.total || 1) * 100) || 0) }}%</span>
            </div>
          </CardContent>
          <div class="absolute bottom-0 left-0 h-1 bg-green-500/20 w-full"></div>
        </Card>

        <Card class="relative overflow-hidden group">
          <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle class="text-sm font-medium">總會話數</CardTitle>
            <MessageSquare class="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats?.usage?.totalSessions || 0 }}</div>
            <p class="text-xs text-muted-foreground">資料庫累計對話總量</p>
          </CardContent>
          <div class="absolute bottom-0 left-0 h-1 bg-blue-500/20 w-full"></div>
        </Card>

        <Card class="relative overflow-hidden group">
          <CardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle class="text-sm font-medium">總訊息交易</CardTitle>
            <Sparkles class="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ stats?.usage?.totalMessages || 0 }}</div>
            <p class="text-xs text-muted-foreground">系統累計傳輸訊息量</p>
          </CardContent>
          <div class="absolute bottom-0 left-0 h-1 bg-amber-500/20 w-full"></div>
        </Card>
      </div>

      <!-- Request Health Section -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card class="lg:col-span-2">
          <CardHeader>
            <CardTitle class="text-lg flex items-center gap-2">
              <Activity class="w-5 h-5 text-primary" />
              請求健康度 (最近 24 小時)
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-6">
            <div class="flex items-end justify-between">
              <div>
                <p class="text-4xl font-black tracking-tighter">{{ stats?.analytics?.recent?.successRate || 0 }}%</p>
                <p class="text-sm text-muted-foreground">整體請求成功率</p>
              </div>
              <div class="text-right text-sm">
                <p><span class="text-muted-foreground">總請求:</span> {{ stats?.analytics?.recent?.total }}</p>
                <p><span class="text-green-500">成功:</span> {{ stats?.analytics?.recent?.success }}</p>
              </div>
            </div>
            
            <div class="h-4 w-full bg-secondary rounded-full overflow-hidden flex">
              <div class="h-full bg-green-500 transition-all" :style="{ width: `${stats?.analytics?.recent?.successRate || 0}%` }"></div>
              <div class="h-full bg-amber-500 transition-all" :style="{ width: `${(stats?.analytics?.recent?.rateLimited / stats?.analytics?.recent?.total * 100) || 0}%` }"></div>
              <div class="h-full bg-destructive transition-all" :style="{ width: `${(stats?.analytics?.recent?.error / stats?.analytics?.recent?.total * 100) || 0}%` }"></div>
            </div>

            <div class="flex flex-wrap gap-4">
               <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-green-500"></div>
                <span class="text-xs text-muted-foreground">成功 (2xx)</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-amber-500"></div>
                <span class="text-xs text-muted-foreground">限流 (429)</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3 h-3 rounded-full bg-destructive"></div>
                <span class="text-xs text-muted-foreground">錯誤 (4xx/5xx)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-lg">狀態碼分佈</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div v-for="dist in stats?.analytics?.distribution" :key="dist.statusCode" class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono border"
                        :class="dist.statusCode >= 200 && dist.statusCode < 300 ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-destructive/10 text-destructive border-destructive/20'">
                    HTTP {{ dist.statusCode }}
                  </span>
                </div>
                <span class="text-sm font-mono font-bold">{{ dist.count }} 次</span>
              </div>
              <div v-if="!stats?.analytics?.distribution?.length" class="py-10 text-center text-muted-foreground italic text-xs">
                尚無請求日誌數據
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Upstream Detailed List -->
      <Card class="border-t-4 border-t-primary shadow-lg">
        <CardHeader class="flex flex-row items-center justify-between">
          <div>
            <CardTitle>憑證池即時健康狀態</CardTitle>
            <p class="text-sm text-muted-foreground mt-1">詳列每個帳號的目前工作情形與冷卻進度</p>
          </div>
          <div class="flex gap-2">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-full px-2 py-1">
              <span class="w-2 h-2 rounded-full bg-green-500"></span> Active
            </div>
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-full px-2 py-1">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span> Limited
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="relative overflow-x-auto rounded-lg border bg-card/50 backdrop-blur-sm">
            <table class="w-full text-sm text-left">
              <thead class="bg-secondary/50 text-muted-foreground font-semibold border-b">
                <tr>
                  <th class="px-5 py-4">憑證標籤 / Label</th>
                  <th class="px-5 py-4">通道類型</th>
                  <th class="px-5 py-4">目前狀態</th>
                  <th class="px-5 py-4 text-center">冷卻恢復倒數</th>
                  <th class="px-5 py-4">最後調用時間</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/50">
                <tr v-for="item in stats?.upstreams?.items" :key="item.id" class="hover:bg-primary/5 transition-colors group">
                  <td class="px-5 py-4 font-bold flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                      <Bot v-if="item.type === 'oauth2'" class="w-4 h-4" />
                      <Key v-else class="w-4 h-4" />
                    </div>
                    {{ item.label }}
                  </td>
                  <td class="px-5 py-4">
                    <span class="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-secondary text-secondary-foreground border">
                      {{ item.type.toUpperCase() }}
                    </span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex items-center gap-2 font-semibold" :class="getStatusColor(item.status)">
                      <CheckCircle2 v-if="item.status === 'active'" class="w-4 h-4 animate-in fade-in duration-500" />
                      <AlertCircle v-else-if="item.status === 'rate_limited'" class="w-4 h-4" />
                      <AlertCircle v-else class="w-4 h-4" />
                      <span class="capitalize tracking-tight">{{ item.status.replace('_', ' ') }}</span>
                    </div>
                  </td>
                  <td class="px-5 py-4 font-mono text-center">
                    <span v-if="item.status === 'rate_limited'" class="text-amber-500 font-bold bg-amber-500/10 px-3 py-1 rounded-md inline-flex items-center gap-2">
                      <Clock class="w-3.5 h-3.5 animate-pulse" /> {{ formatTime(item.recoveryAt) }}
                    </span>
                    <span v-else class="text-muted-foreground/40">-</span>
                  </td>
                  <td class="px-5 py-4 text-muted-foreground tabular-nums">
                    {{ item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : 'Never' }}
                  </td>
                </tr>
                <tr v-if="!stats?.upstreams?.items?.length">
                  <td colspan="5" class="px-5 py-12 text-center">
                    <div class="flex flex-col items-center gap-3">
                      <Server class="w-12 h-12 text-muted-foreground/20" />
                      <p class="text-muted-foreground italic">尚未註冊任何上游憑證池</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.tracking-tight {
  letter-spacing: -0.025em;
}
</style>
