<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-vue-next'

const toastStore = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div class="fixed bottom-0 right-0 z-[1000] p-4 md:p-6 space-y-3 pointer-events-none w-full max-w-sm">
      <TransitionGroup name="toast">
        <div v-for="toast in toastStore.toasts" :key="toast.id" 
          class="flex items-center gap-3 p-4 bg-card border border-border shadow-2xl rounded-xl pointer-events-auto overflow-hidden relative group"
          :class="{
            'border-l-4 border-l-green-500': toast.type === 'success',
            'border-l-4 border-l-destructive': toast.type === 'error',
            'border-l-4 border-l-blue-500': toast.type === 'info',
          }">
          
          <div class="flex-shrink-0">
            <CheckCircle2 v-if="toast.type === 'success'" class="w-5 h-5 text-green-500" />
            <AlertCircle v-else-if="toast.type === 'error'" class="w-5 h-5 text-destructive" />
            <Info v-else class="w-5 h-5 text-blue-500" />
          </div>

          <p class="text-sm font-medium pr-6 leading-tight">{{ toast.message }}</p>

          <button @click="toastStore.removeToast(toast.id)" 
            class="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%) scale(0.9);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%) translateY(-20px);
}
</style>
