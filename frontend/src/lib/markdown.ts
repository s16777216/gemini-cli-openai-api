import MarkdownIt from 'markdown-it'
import { createHighlighter, type Highlighter } from 'shiki'
import DOMPurify from 'dompurify'

let md: MarkdownIt | null = null
let highlighter: Highlighter | null = null

export async function initMarkdown() {
  if (md && highlighter) return { md, highlighter }

  highlighter = await createHighlighter({
    themes: ['vitesse-dark'],
    langs: [
      'javascript',
      'typescript',
      'vue',
      'css',
      'html',
      'bash',
      'json',
      'markdown',
      'python',
      'yaml',
      'sql',
      'sh'
    ]
  })

  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: (code, lang) => {
      if (highlighter && lang && highlighter.getLoadedLanguages().includes(lang)) {
        return highlighter.codeToHtml(code, {
          lang,
          theme: 'vitesse-dark'
        })
      }
      return '' // use external default escaping
    }
  })

  return { md, highlighter }
}

export async function renderMarkdown(content: string) {
  const { md: instance } = await initMarkdown()
  const dirty = instance.render(content)
  return DOMPurify.sanitize(dirty)
}
