import { invoke } from '@tauri-apps/api/core'
import type { PromptVariable } from '../types/prompt'

const BROWSER_STORAGE_KEY = 'promptcraft.promptDraft'
const MAX_DRAFT_SIZE = 512 * 1024

export interface PromptDraft {
  id: string
  title: string
  folderId: string
  version: string
  content: string
  variables: PromptVariable[]
  updatedAt: string
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isPromptDraft(value: unknown): value is PromptDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.folderId === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.content === 'string' &&
    typeof obj.updatedAt === 'string' &&
    Array.isArray(obj.variables) &&
    obj.variables.every(
      (v: unknown) =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>).id === 'string' &&
        typeof (v as Record<string, unknown>).label === 'string' &&
        typeof (v as Record<string, unknown>).value === 'string' &&
        typeof (v as Record<string, unknown>).group === 'string',
    )
  )
}

export async function loadPromptDraft(): Promise<PromptDraft | null> {
  if (isTauriRuntime()) {
    return invoke<PromptDraft | null>('load_prompt_draft')
  }

  const storedValue = window.localStorage.getItem(BROWSER_STORAGE_KEY)
  if (storedValue == null) return null

  if (storedValue.length > MAX_DRAFT_SIZE) {
    window.localStorage.removeItem(BROWSER_STORAGE_KEY)
    return null
  }

  const parsed: unknown = JSON.parse(storedValue)
  if (!isPromptDraft(parsed)) {
    window.localStorage.removeItem(BROWSER_STORAGE_KEY)
    return null
  }

  return parsed
}

export async function savePromptDraft(draft: PromptDraft): Promise<PromptDraft> {
  if (isTauriRuntime()) {
    return invoke<PromptDraft>('save_prompt_draft', { draft })
  }

  window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(draft))
  return draft
}
