import { invoke } from '@tauri-apps/api/core'
import type { PromptVariable } from '../types/prompt'

const BROWSER_STORAGE_KEY = 'promptcraft.promptDraft'

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

export async function loadPromptDraft(): Promise<PromptDraft | null> {
  if (isTauriRuntime()) {
    return invoke<PromptDraft | null>('load_prompt_draft')
  }

  const storedValue = window.localStorage.getItem(BROWSER_STORAGE_KEY)
  if (storedValue == null) return null

  return JSON.parse(storedValue) as PromptDraft
}

export async function savePromptDraft(draft: PromptDraft): Promise<PromptDraft> {
  if (isTauriRuntime()) {
    return invoke<PromptDraft>('save_prompt_draft', { draft })
  }

  window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(draft))
  return draft
}
