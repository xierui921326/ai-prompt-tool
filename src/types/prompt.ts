export type SegmentKind = 'text' | 'variable'

export interface PromptSegment {
  id: string
  kind: SegmentKind
  value: string
}

export interface PromptVariable {
  id: string
  label: string
  value: string
  group: string
}

export interface PromptItem {
  id: string
  title: string
  version: string
  createdAt: string
  updatedAt: string
  category: string
  contentSegments: PromptSegment[]
  variables: PromptVariable[]
}

export interface FolderItem {
  id: string
  name: string
  count: number
}

export interface PromptVersion {
  id: string
  title: string
  date: string
  parentId?: string
  active?: boolean
  branch?: boolean
}

export type KnowledgeCategory = string

export interface KnowledgeTerm {
  id: string
  name: string
  category: string
  description: string
}

export interface AssistantMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  status?: 'normal' | 'generating'
}

export interface GenerationStep {
  id: string
  label: string
  done: boolean
}

export interface UsagePoint {
  id: string
  value: number
}

export interface PromptVersionRecord {
  id: string
  title: string
  date: string
  parentId?: string | null
  branch?: boolean
  content: string
  variables: PromptVariable[]
}

export interface PromptRecord {
  id: string
  title: string
  folderId: string
  category: string
  content: string
  variables: PromptVariable[]
  activeVersionId: string
  versions: PromptVersionRecord[]
  createdAt: string
  updatedAt: string
}

export interface FolderRecord {
  id: string
  name: string
  system: boolean
}

export interface TrashEntry {
  prompt: PromptRecord
  deletedAt: string
}

export interface WorkspaceState {
  schemaVersion: number
  activePromptId: string | null
  folders: FolderRecord[]
  prompts: PromptRecord[]
  trash: TrashEntry[]
}

export interface LangfuseSettingsInput {
  host: string
  publicKey: string
  secretKey: string
}

export interface PublicLangfuseSettings {
  host: string
  publicKey: string
  hasSecret: boolean
}

export interface LangfuseConnectionStatus {
  ok: boolean
  message: string
  host: string
}

export interface RemotePromptSummary {
  name: string
  versions: number[]
  labels: string[]
  tags: string[]
  lastUpdatedAt?: string | null
  lastConfig?: unknown
}

export interface RemotePrompt {
  name: string
  version: number
  promptType?: string | null
  body: string
  config?: unknown
  labels: string[]
  tags: string[]
  updatedAt?: string | null
}

export interface RemoteDataset {
  id: string
  name: string
  description?: string | null
  itemsCount?: number | null
  updatedAt?: string | null
}

export interface RemoteDatasetItem {
  id: string
  status?: string | null
  input?: unknown
  expectedOutput?: unknown
  metadata?: unknown
  sourceTraceId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export interface LangfuseCache {
  fetchedAt?: string | null
  prompts: RemotePromptSummary[]
  datasets: RemoteDataset[]
  datasetItems: Record<string, RemoteDatasetItem[]>
}

export interface RecordLangfuseEventInput {
  eventType: string
  promptId: string
  promptTitle?: string
  metadata?: Record<string, unknown>
}
