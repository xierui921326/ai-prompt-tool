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

export type KnowledgeCategory = '全部' | '生成风格' | '镜头语言' | '动态虚化' | '其他'

export interface KnowledgeTerm {
  id: string
  name: string
  category: Exclude<KnowledgeCategory, '全部'>
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
