<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { renderMarkdown, initMarkdown } from '@/lib/markdown'
import 'github-markdown-css/github-markdown-dark.css'

const props = defineProps<{
  content: string
}>()

const renderedHtml = ref('')
const isInitializing = ref(true)

const updateMarkdown = async () => {
  if (!props.content) {
    renderedHtml.value = ''
    return
  }
  renderedHtml.value = await renderMarkdown(props.content)
}

watch(() => props.content, updateMarkdown)

onMounted(async () => {
  await initMarkdown()
  isInitializing.value = false
  await updateMarkdown()
})
</script>

<template>
  <div class="markdown-body !bg-transparent !p-0 !text-inherit" v-html="renderedHtml"></div>
  <div v-if="isInitializing && !renderedHtml" class="flex gap-1.5 py-2">
    <div class="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce delay-75"></div>
    <div class="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce delay-150"></div>
    <div class="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce delay-300"></div>
  </div>
</template>

<style>
/* 修正 github-markdown-css 與 Tailwind 的衝突 */
.markdown-body {
  font-family: inherit;
  line-height: 1.6;
}

.markdown-body pre {
  background-color: #1e1e1e !important;
  border-radius: 12px;
  border: 1px border border-border/40;
  padding: 1rem;
  margin: 1rem 0;
  overflow-x: auto;
}

.markdown-body code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9em;
}

/* Shiki 產生的高亮樣式微調 */
.markdown-body .shiki {
  background-color: transparent !important;
  margin: 0;
  padding: 0;
}

.markdown-body ul, .markdown-body ol {
  list-style: disc;
  padding-left: 2em;
  margin: 1em 0;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3 {
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 0.3em;
  margin-top: 1.5em;
  margin-bottom: 1em;
}

.markdown-body table {
    display: block;
    width: 100%;
    width: max-content;
    max-width: 100%;
    overflow: auto;
    border-collapse: collapse;
    margin: 1rem 0;
}

.markdown-body table th,
.markdown-body table td {
    padding: 6px 13px;
    border: 1px solid hsl(var(--border));
}

.markdown-body table tr {
    background-color: transparent;
    border-top: 1px solid hsl(var(--border));
}

.markdown-body blockquote {
    padding: 0 1em;
    color: hsl(var(--muted-foreground));
    border-left: 0.25em solid hsl(var(--border));
    margin: 1rem 0;
}
</style>
