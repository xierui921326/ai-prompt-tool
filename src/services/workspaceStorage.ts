import { invoke } from '@tauri-apps/api/core'
import type {
  FolderRecord,
  PromptRecord,
  PromptVariable,
  PromptVersionRecord,
  TrashEntry,
  WorkspaceState,
} from '../types/prompt'

const BROWSER_STORAGE_KEY = 'promptcraft.workspace'
const SCHEMA_VERSION = 1

export interface CreatePromptInput {
  id: string
  title: string
  folderId: string
  category?: string
  content?: string
  variables?: PromptVariable[]
  versionId: string
  createdAt: string
}

export interface UpdatePromptInput {
  id: string
  title?: string
  folderId?: string
  category?: string
  content?: string
  variables?: PromptVariable[]
  updatedAt: string
}

export interface CommitVersionInput {
  promptId: string
  versionId: string
  title: string
  date: string
  parentId?: string | null
  branch?: boolean
}

export interface CheckoutVersionInput {
  promptId: string
  versionId: string
  updatedAt: string
}

export interface DeletePromptInput {
  id: string
  deletedAt: string
}

export interface CreateFolderInput {
  id: string
  name: string
}

export interface RenameFolderInput {
  id: string
  name: string
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function nowISO(): string {
  return new Date().toISOString()
}

function buildSeedWorkspace(): WorkspaceState {
  const now = '2024-05-22T20:16:00+08:00'
  const variables: PromptVariable[] = [
    { id: 'city', label: '城市', value: '上海', group: '场景' },
    { id: 'style', label: '风格', value: '电影感', group: '视觉' },
    { id: 'lens', label: '镜头类型', value: '无人机推轨', group: '镜头' },
    { id: 'mood', label: '氛围', value: '现代、冷静、大气', group: '情绪' },
    { id: 'landmark', label: '地标建筑', value: '陆家嘴天际线', group: '场景' },
    { id: 'motion', label: '动态虚化', value: '车流拖影', group: '运动' },
    { id: 'tone', label: '色调', value: '蓝黑与金色高光', group: '视觉' },
    { id: 'resolution', label: '分辨率', value: '4K', group: '参数' },
    { id: 'duration', label: '时长', value: '8秒', group: '参数' },
  ]
  const content =
    '请生成一段{{城市}}夜景的航拍视频，风格为{{风格}}，镜头语言使用{{镜头类型}}，强调{{氛围}}，画面中包含{{地标建筑}}，使用{{动态虚化}}效果，整体色调为{{色调}}，分辨率{{分辨率}}，时长{{时长}}。'

  const versions: PromptVersionRecord[] = [
    { id: 'v1.0', title: '初始版本', date: '2024-05-20T10:00:00+08:00', parentId: null, branch: false, content, variables },
    { id: 'v2.0', title: '调整镜头语言', date: '2024-05-21T11:10:00+08:00', parentId: 'v1.0', branch: false, content, variables },
    { id: 'v2.1', title: '增加动态虚化', date: '2024-05-21T14:20:00+08:00', parentId: 'v2.0', branch: true, content, variables },
    { id: 'v2.2', title: '调整色调', date: '2024-05-21T16:50:00+08:00', parentId: 'v2.0', branch: true, content, variables },
    { id: 'v3.0', title: '优化整体描述', date: '2024-05-22T09:30:00+08:00', parentId: 'v2.0', branch: false, content, variables },
    { id: 'v3.2', title: '当前版本', date: now, parentId: 'v3.0', branch: false, content, variables },
  ]

  const promptId = 'urban-night-drone'
  const prompt: PromptRecord = {
    id: promptId,
    title: '无人机航拍电影感的城市夜景',
    folderId: 'photo',
    category: '摄影',
    content,
    variables,
    activeVersionId: 'v3.2',
    versions,
    createdAt: '2024-05-20T09:30:00+08:00',
    updatedAt: now,
  }

  const folders: FolderRecord[] = [
    { id: 'all', name: '全部 Prompt', system: true },
    { id: 'photo', name: '摄影', system: false },
    { id: 'product', name: '产品设计', system: false },
    { id: 'copy', name: '文案写作', system: false },
    { id: 'agent', name: '智能体项目', system: false },
    { id: 'other', name: '其他', system: false },
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    activePromptId: promptId,
    folders,
    prompts: [prompt],
    trash: [],
  }
}

function readBrowserWorkspace(): WorkspaceState {
  const raw = window.localStorage.getItem(BROWSER_STORAGE_KEY)
  if (raw == null) {
    const seed = buildSeedWorkspace()
    window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(seed))
    return seed
  }
  return JSON.parse(raw) as WorkspaceState
}

function writeBrowserWorkspace(workspace: WorkspaceState): WorkspaceState {
  window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(workspace))
  return workspace
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function ensureFolderExists(workspace: WorkspaceState, folderId: string): void {
  if (!workspace.folders.some((folder) => folder.id === folderId)) {
    throw new Error(`文件夹不存在：${folderId}`)
  }
}

function browserCreatePrompt(input: CreatePromptInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  if (workspace.prompts.some((item) => item.id === input.id)) {
    throw new Error(`Prompt ID 已存在：${input.id}`)
  }
  if (workspace.trash.some((entry) => entry.prompt.id === input.id)) {
    throw new Error(`Prompt ID 在回收站中已存在：${input.id}`)
  }
  ensureFolderExists(workspace, input.folderId)

  const variables = input.variables ?? []
  const content = input.content ?? ''
  const initialVersion: PromptVersionRecord = {
    id: input.versionId,
    title: '初始版本',
    date: input.createdAt,
    parentId: null,
    branch: false,
    content,
    variables,
  }
  const prompt: PromptRecord = {
    id: input.id,
    title: input.title,
    folderId: input.folderId,
    category: input.category ?? '未分类',
    content,
    variables,
    activeVersionId: input.versionId,
    versions: [initialVersion],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  }
  workspace.prompts.push(prompt)
  workspace.activePromptId = prompt.id
  return writeBrowserWorkspace(workspace)
}

function browserUpdatePrompt(input: UpdatePromptInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const prompt = workspace.prompts.find((item) => item.id === input.id)
  if (prompt == null) throw new Error(`找不到 Prompt：${input.id}`)
  if (input.title != null) {
    if (input.title.trim().length === 0) throw new Error('Prompt 标题不能为空')
    prompt.title = input.title
  }
  if (input.folderId != null) {
    ensureFolderExists(workspace, input.folderId)
    prompt.folderId = input.folderId
  }
  if (input.category != null) prompt.category = input.category
  if (input.content != null) prompt.content = input.content
  if (input.variables != null) prompt.variables = input.variables
  prompt.updatedAt = input.updatedAt
  return writeBrowserWorkspace(workspace)
}

function browserDeletePrompt(input: DeletePromptInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const index = workspace.prompts.findIndex((item) => item.id === input.id)
  if (index < 0) throw new Error(`找不到 Prompt：${input.id}`)
  const [prompt] = workspace.prompts.splice(index, 1)
  workspace.trash.push({ prompt, deletedAt: input.deletedAt })
  if (workspace.activePromptId === input.id) {
    workspace.activePromptId = workspace.prompts[0]?.id ?? null
  }
  return writeBrowserWorkspace(workspace)
}

function browserRestorePrompt(id: string, updatedAt: string): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const index = workspace.trash.findIndex((entry) => entry.prompt.id === id)
  if (index < 0) throw new Error(`回收站中找不到 Prompt：${id}`)
  const [entry] = workspace.trash.splice(index, 1)
  const prompt = entry.prompt
  if (!workspace.folders.some((folder) => folder.id === prompt.folderId)) {
    const fallback = workspace.folders.find((folder) => !folder.system) ?? workspace.folders[0]
    prompt.folderId = fallback?.id ?? 'all'
  }
  prompt.updatedAt = updatedAt
  workspace.prompts.push(prompt)
  workspace.activePromptId = prompt.id
  return writeBrowserWorkspace(workspace)
}

function browserPurgePrompt(id: string): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const index = workspace.trash.findIndex((entry) => entry.prompt.id === id)
  if (index < 0) throw new Error(`回收站中找不到 Prompt：${id}`)
  workspace.trash.splice(index, 1)
  return writeBrowserWorkspace(workspace)
}

function browserCommitVersion(input: CommitVersionInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const prompt = workspace.prompts.find((item) => item.id === input.promptId)
  if (prompt == null) throw new Error(`找不到 Prompt：${input.promptId}`)
  if (prompt.versions.some((version) => version.id === input.versionId)) {
    throw new Error(`版本号已存在：${input.versionId}`)
  }
  const snapshot: PromptVersionRecord = {
    id: input.versionId,
    title: input.title,
    date: input.date,
    parentId: input.parentId ?? prompt.activeVersionId,
    branch: input.branch ?? false,
    content: prompt.content,
    variables: prompt.variables,
  }
  prompt.versions.push(snapshot)
  prompt.activeVersionId = input.versionId
  prompt.updatedAt = input.date
  return writeBrowserWorkspace(workspace)
}

function browserCheckoutVersion(input: CheckoutVersionInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const prompt = workspace.prompts.find((item) => item.id === input.promptId)
  if (prompt == null) throw new Error(`找不到 Prompt：${input.promptId}`)
  const version = prompt.versions.find((item) => item.id === input.versionId)
  if (version == null) throw new Error(`找不到版本：${input.versionId}`)
  prompt.content = version.content
  prompt.variables = version.variables
  prompt.activeVersionId = version.id
  prompt.updatedAt = input.updatedAt
  return writeBrowserWorkspace(workspace)
}

function browserCreateFolder(input: CreateFolderInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  if (workspace.folders.some((folder) => folder.id === input.id)) {
    throw new Error(`文件夹 ID 已存在：${input.id}`)
  }
  workspace.folders.push({ id: input.id, name: input.name, system: false })
  return writeBrowserWorkspace(workspace)
}

function browserRenameFolder(input: RenameFolderInput): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const folder = workspace.folders.find((item) => item.id === input.id)
  if (folder == null) throw new Error(`找不到文件夹：${input.id}`)
  if (folder.system) throw new Error('系统文件夹无法重命名')
  folder.name = input.name
  return writeBrowserWorkspace(workspace)
}

function browserDeleteFolder(id: string): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  const index = workspace.folders.findIndex((folder) => folder.id === id)
  if (index < 0) throw new Error(`找不到文件夹：${id}`)
  if (workspace.folders[index].system) throw new Error('系统文件夹无法删除')
  const fallback =
    workspace.folders.find((folder) => folder.id !== id && !folder.system)?.id ?? 'all'
  for (const prompt of workspace.prompts) {
    if (prompt.folderId === id) prompt.folderId = fallback
  }
  for (const entry of workspace.trash) {
    if (entry.prompt.folderId === id) entry.prompt.folderId = fallback
  }
  workspace.folders.splice(index, 1)
  return writeBrowserWorkspace(workspace)
}

function browserSetActivePrompt(id: string | null): WorkspaceState {
  const workspace = clone(readBrowserWorkspace())
  if (id != null && !workspace.prompts.some((item) => item.id === id)) {
    throw new Error(`找不到 Prompt：${id}`)
  }
  workspace.activePromptId = id
  return writeBrowserWorkspace(workspace)
}

export async function loadWorkspace(): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('load_workspace')
  }
  return readBrowserWorkspace()
}

export async function saveWorkspace(workspace: WorkspaceState): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('save_workspace', { workspace })
  }
  return writeBrowserWorkspace(workspace)
}

export async function createPrompt(input: CreatePromptInput): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('create_prompt', { input })
  }
  return browserCreatePrompt(input)
}

export async function updatePrompt(input: UpdatePromptInput): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('update_prompt', { input })
  }
  return browserUpdatePrompt(input)
}

export async function deletePrompt(id: string): Promise<WorkspaceState> {
  const input: DeletePromptInput = { id, deletedAt: nowISO() }
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('delete_prompt', { input })
  }
  return browserDeletePrompt(input)
}

export async function restorePrompt(id: string): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('restore_prompt', { id, updatedAt: nowISO() })
  }
  return browserRestorePrompt(id, nowISO())
}

export async function purgePrompt(id: string): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('purge_prompt', { id })
  }
  return browserPurgePrompt(id)
}

export async function commitPromptVersion(input: CommitVersionInput): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('commit_prompt_version', { input })
  }
  return browserCommitVersion(input)
}

export async function checkoutPromptVersion(input: CheckoutVersionInput): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('checkout_prompt_version', { input })
  }
  return browserCheckoutVersion(input)
}

export async function createFolder(input: CreateFolderInput): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('create_folder', { input })
  }
  return browserCreateFolder(input)
}

export async function renameFolder(input: RenameFolderInput): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('rename_folder', { input })
  }
  return browserRenameFolder(input)
}

export async function deleteFolder(id: string): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('delete_folder', { id })
  }
  return browserDeleteFolder(id)
}

export async function setActivePrompt(id: string | null): Promise<WorkspaceState> {
  if (isTauriRuntime()) {
    return invoke<WorkspaceState>('set_active_prompt', { id })
  }
  return browserSetActivePrompt(id)
}

export function generatePromptId(seed?: string): string {
  const slug = (seed ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
  const random = Math.random().toString(36).slice(2, 8)
  if (slug.length === 0) return `prompt-${Date.now()}-${random}`
  return `${slug}-${random}`
}

export function generateFolderId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '')
  if (slug.length === 0) return `folder-${Date.now().toString(36)}`
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`
}

export type { PromptRecord, PromptVersionRecord, FolderRecord, TrashEntry, WorkspaceState }
