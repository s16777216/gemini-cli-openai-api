<script setup lang="ts">
// App.vue 現在只負責全域佈局與路由渲染
</script>

<template>
  <div class="bg-background min-h-screen text-foreground font-sans selection:bg-primary/30 selection:text-white">
    <router-view v-slot="{ Component }">
      <transition name="fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 全域捲軸樣式 (Zinc 深色模式) */
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #27272a; /* Zinc 800 */
  border-radius: 10px;
  border: 3px solid #09090b; /* Zinc 950 */
}

::-webkit-scrollbar-thumb:hover {
  background: #3f3f46; /* Zinc 700 */
}
</style>
