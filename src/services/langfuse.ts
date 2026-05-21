import { knowledgeTerms, versions } from '../data/promptCraftData'
import type { KnowledgeCategory, KnowledgeTerm, PromptItem, PromptVersion } from '../types/prompt'

export interface PromptTracePayload {
  promptId: string
  action: 'create' | 'update' | 'share' | 'generate'
  metadata?: Record<string, string | number | boolean>
}

export async function searchKnowledgeTerms(query: string, category: KnowledgeCategory): Promise<KnowledgeTerm[]> {
  const normalizedQuery = query.trim().toLowerCase()

  return knowledgeTerms.filter((term) => {
    const matchesCategory = category === '全部' || term.category === category
    const matchesQuery =
      normalizedQuery.length === 0 ||
      term.name.toLowerCase().includes(normalizedQuery) ||
      term.description.toLowerCase().includes(normalizedQuery)

    return matchesCategory && matchesQuery
  })
}

export async function loadPromptVersions(_promptId: string): Promise<PromptVersion[]> {
  return versions
}

export async function createPromptTrace(_payload: PromptTracePayload): Promise<{ status: 'local-only' }> {
  return { status: 'local-only' }
}

export async function syncPromptTemplate(_prompt: PromptItem): Promise<never> {
  throw new Error('Langfuse 未配置：请在 Tauri 后端通过安全配置接入 Langfuse 后再同步 Prompt 模板')
}
