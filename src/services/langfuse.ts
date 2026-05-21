import { invoke } from '@tauri-apps/api/core'

import { knowledgeTerms } from '../data/promptCraftData'
import type {
  KnowledgeCategory,
  KnowledgeTerm,
  LangfuseCache,
  LangfuseConnectionStatus,
  LangfuseSettingsInput,
  PublicLangfuseSettings,
  RecordLangfuseEventInput,
  RemoteDataset,
  RemoteDatasetItem,
  RemotePrompt,
  RemotePromptSummary,
} from '../types/prompt'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isLangfuseRuntimeAvailable(): boolean {
  return isTauriRuntime()
}

export async function loadLangfuseSettings(): Promise<PublicLangfuseSettings | null> {
  if (!isTauriRuntime()) return null
  const settings = await invoke<PublicLangfuseSettings | null>('load_langfuse_settings')
  return settings ?? null
}

export async function saveLangfuseSettings(
  input: LangfuseSettingsInput,
): Promise<PublicLangfuseSettings> {
  if (!isTauriRuntime()) {
    throw new Error('浏览器预览模式下无法保存 Langfuse 凭据，请在桌面端配置')
  }
  return invoke<PublicLangfuseSettings>('save_langfuse_settings', { input })
}

export async function clearLangfuseSettings(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke<void>('clear_langfuse_settings')
}

export async function testLangfuseConnection(): Promise<LangfuseConnectionStatus> {
  if (!isTauriRuntime()) {
    return { ok: false, message: '浏览器预览模式无法连接 Langfuse，请在桌面端运行', host: '' }
  }
  return invoke<LangfuseConnectionStatus>('test_langfuse_connection')
}

export async function listLangfusePrompts(limit?: number): Promise<RemotePromptSummary[]> {
  if (!isTauriRuntime()) return []
  return invoke<RemotePromptSummary[]>('list_langfuse_prompts', { limit })
}

export async function fetchLangfusePrompt(input: {
  name: string
  version?: number
  label?: string
}): Promise<RemotePrompt> {
  if (!isTauriRuntime()) {
    throw new Error('浏览器预览模式无法导入 Langfuse Prompt，请在桌面端运行')
  }
  return invoke<RemotePrompt>('fetch_langfuse_prompt', input)
}

export async function listLangfuseDatasets(): Promise<RemoteDataset[]> {
  if (!isTauriRuntime()) return []
  return invoke<RemoteDataset[]>('list_langfuse_datasets')
}

export async function fetchLangfuseDatasetItems(
  name: string,
  limit?: number,
): Promise<RemoteDatasetItem[]> {
  if (!isTauriRuntime()) return []
  return invoke<RemoteDatasetItem[]>('fetch_langfuse_dataset_items', { name, limit })
}

export async function recordLangfuseEvent(input: RecordLangfuseEventInput): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    await invoke<void>('record_langfuse_event', { input })
  } catch (error) {
    console.warn('[langfuse] record_event failed', error)
  }
}

export async function loadLangfuseCache(): Promise<LangfuseCache> {
  if (!isTauriRuntime()) {
    return { fetchedAt: null, prompts: [], datasets: [], datasetItems: {} }
  }
  return invoke<LangfuseCache>('load_langfuse_cache')
}

export function knowledgeTermFromDatasetItem(
  datasetName: string,
  item: RemoteDatasetItem,
): KnowledgeTerm {
  const name = extractStringField(item.input, ['name', 'term', 'title']) ?? item.id
  const description =
    extractStringField(item.input, ['description', 'content', 'value', 'detail']) ??
    extractStringField(item.expectedOutput, ['description', 'content']) ??
    JSON.stringify(item.input ?? {}).slice(0, 160)
  const category = inferKnowledgeCategory(item, datasetName)
  return {
    id: `${datasetName}:${item.id}`,
    name,
    category,
    description,
  }
}

function inferKnowledgeCategory(
  item: RemoteDatasetItem,
  datasetName: string,
): Exclude<KnowledgeCategory, '全部'> {
  const candidates: KnowledgeCategory[] = ['生成风格', '镜头语言', '动态虚化', '其他']
  const rawCategory =
    extractStringField(item.input, ['category', 'type', 'tag']) ??
    extractStringField(item.metadata, ['category', 'type', 'tag']) ??
    datasetName
  for (const candidate of candidates) {
    if (candidate === '全部') continue
    if (rawCategory.includes(candidate)) return candidate as Exclude<KnowledgeCategory, '全部'>
  }
  return '其他'
}

function extractStringField(value: unknown, keys: string[]): string | undefined {
  if (typeof value === 'string') return value
  if (value == null || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  return undefined
}

export function fallbackKnowledgeTerms(): KnowledgeTerm[] {
  return knowledgeTerms
}
