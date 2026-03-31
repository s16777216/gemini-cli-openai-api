<script setup lang="ts">
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'radix-vue'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  title: string
  description: string
  cancelText?: string
  actionText?: string
  variant?: 'default' | 'destructive'
}

withDefaults(defineProps<Props>(), {
  variant: 'default',
  cancelText: '取消',
  actionText: '確認',
})

const emit = defineEmits(['update:open', 'cancel', 'action'])
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="val => emit('update:open', val)">
    <AlertDialogPortal>
      <AlertDialogOverlay
        class="fixed inset-0 z-[110] bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
      />
      <AlertDialogContent
        class="fixed left-[50%] top-[50%] z-[120] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-6 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-xl"
      >
        <div class="flex flex-col space-y-2 text-center sm:text-left">
          <AlertDialogTitle class="text-lg font-bold tracking-tight">
            {{ title }}
          </AlertDialogTitle>
          <AlertDialogDescription class="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {{ description }}
          </AlertDialogDescription>
        </div>
        <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 sm:gap-0 mt-2">
          <AlertDialogCancel as-child @click="emit('cancel')">
            <Button variant="outline" class="rounded-lg">{{ cancelText }}</Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child @click="emit('action')">
            <Button :variant="variant === 'destructive' ? 'destructive' : 'default'" class="rounded-lg">
              {{ actionText }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
