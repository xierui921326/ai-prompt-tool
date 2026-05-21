import {
  ArchiveRestore,
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Folder,
  GitCommit,
  Home,
  Import,
  LayoutTemplate,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  Variable,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  assistantMessages,
  generationSteps,
  knowledgeCategories,
  knowledgeTerms,
} from './data/promptCraftData'
import {
  checkoutPromptVersion,
  commitPromptVersion,
  createFolder as createFolderRequest,
  createPrompt as createPromptRequest,
  deleteFolder as deleteFolderRequest,
  deletePrompt as deletePromptRequest,
  generateFolderId,
  generatePromptId,
  loadWorkspace,
  purgePrompt as purgePromptRequest,
  restorePrompt as restorePromptRequest,
  setActivePrompt,
  updatePrompt as updatePromptRequest,
} from './services/workspaceStorage'
import type {
  AssistantMessage,
  FolderRecord,
  GenerationStep,
  KnowledgeCategory,
  KnowledgeTerm,
  PromptRecord,
  PromptVariable,
  PromptVersionRecord,
  TrashEntry,
  WorkspaceState,
} from './types/prompt'

const navigationItems = [
  { id: 'home', label: '主页', icon: Home },
  { id: 'prompts', label: '我的 Prompt', icon: FileText },
  { id: 'knowledge', label: '知识库', icon: BookOpen },
  { id: 'variables', label: '变量管理', icon: Variable },
  { id: 'templates', label: '模板中心', icon: LayoutTemplate },
  { id: 'share', label: '分享中心', icon: Share2 },
  { id: 'trash', label: '回收站', icon: Trash2 },
] as const

const tabs = ['编辑器', '历史版本', '变量', '分享', '设置'] as const

type NavigationId = (typeof navigationItems)[number]['id']
type TabName = (typeof tabs)[number]

const usagePointSamples = [22, 36, 41, 28, 30, 24, 34, 27, 33, 29, 57, 35, 44]

const emptyWorkspace: WorkspaceState = {
  schemaVersion: 1,
  activePromptId: null,
  folders: [],
  prompts: [],
  trash: [],
}

function formatDateCN(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function nowISO(): string {
  return new Date().toISOString()
}

function pickFallbackFolderId(folders: FolderRecord[]): string {
  const userFolder = folders.find((folder) => !folder.system)
  return userFolder?.id ?? folders[0]?.id ?? 'all'
}

function buildNextVersionId(versions: PromptVersionRecord[]): string {
  const existing = new Set(versions.map((version) => version.id))
  let major = 1
  for (const version of versions) {
    const match = /^v(\d+)\./.exec(version.id)
    if (match != null) major = Math.max(major, Number(match[1]))
  }
  for (let minor = 0; minor < 999; minor += 1) {
    const candidate = `v${major}.${minor + 1}`
    if (!existing.has(candidate)) return candidate
  }
  return `v${major}.${Date.now().toString(36)}`
}

function App(): ReactElement {
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace)
  const [activeNav, setActiveNav] = useState<NavigationId>('prompts')
  const [activeFolder, setActiveFolder] = useState('all')
  const [activeTab, setActiveTab] = useState<TabName>('编辑器')
  const [activeKnowledgeCategory, setActiveKnowledgeCategory] = useState<KnowledgeCategory>('全部')
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>(assistantMessages)
  const [assistantInput, setAssistantInput] = useState('')
  const [planSteps, setPlanSteps] = useState<GenerationStep[]>(generationSteps)
  const [notice, setNotice] = useState('正在加载本地工作区...')
  const [searchText, setSearchText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadWorkspace()
      .then((next) => {
        setWorkspace(next)
        if (next.prompts.length === 0 && next.trash.length === 0) {
          setNotice('已初始化空白工作区，可点击右上角“新建 Prompt”开始。')
        } else {
          setNotice('已加载本地工作区。')
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setNotice(`工作区加载失败：${message}`)
      })
      .finally(() => setIsLoading(false))
  }, [])

  const activePrompt: PromptRecord | undefined = useMemo(() => {
    if (workspace.activePromptId == null) return undefined
    return workspace.prompts.find((prompt) => prompt.id === workspace.activePromptId)
  }, [workspace])

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const folder of workspace.folders) counts.set(folder.id, 0)
    for (const prompt of workspace.prompts) {
      counts.set(prompt.folderId, (counts.get(prompt.folderId) ?? 0) + 1)
    }
    return counts
  }, [workspace.folders, workspace.prompts])

  const totalPrompts = workspace.prompts.length

  const visibleFolders: FolderRecord[] = workspace.folders

  const folderPrompts = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return workspace.prompts.filter((prompt) => {
      const matchesFolder = activeFolder === 'all' || prompt.folderId === activeFolder
      const matchesQuery =
        query.length === 0 ||
        prompt.title.toLowerCase().includes(query) ||
        prompt.content.toLowerCase().includes(query)
      return matchesFolder && matchesQuery
    })
  }, [workspace.prompts, activeFolder, searchText])

  const filteredTerms = useMemo(() => {
    const query = knowledgeQuery.trim().toLowerCase()
    return knowledgeTerms.filter((term) => {
      const matchesCategory = activeKnowledgeCategory === '全部' || term.category === activeKnowledgeCategory
      const matchesQuery =
        query.length === 0 || term.name.toLowerCase().includes(query) || term.description.toLowerCase().includes(query)
      return matchesCategory && matchesQuery
    })
  }, [activeKnowledgeCategory, knowledgeQuery])

  const currentFolder = workspace.folders.find((folder) => folder.id === activeFolder) ?? workspace.folders[0]
  const currentFolderName = currentFolder?.name ?? activeFolder

  const updateActivePromptLocally = useCallback(
    (updater: (prompt: PromptRecord) => PromptRecord) => {
      setWorkspace((current) => {
        if (current.activePromptId == null) return current
        return {
          ...current,
          prompts: current.prompts.map((prompt) =>
            prompt.id === current.activePromptId ? updater(prompt) : prompt,
          ),
        }
      })
    },
    [],
  )

  const handlePromptSwitch = useCallback(async (id: string) => {
    setWorkspace((current) => ({ ...current, activePromptId: id }))
    try {
      const next = await setActivePrompt(id)
      setWorkspace(next)
      setActiveTab('编辑器')
      const switched = next.prompts.find((prompt) => prompt.id === id)
      if (switched != null) setNotice(`已切换到 Prompt：${switched.title}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`切换 Prompt 失败：${message}`)
    }
  }, [])

  const handlePromptContentChange = useCallback(
    (value: string) => {
      updateActivePromptLocally((prompt) => ({ ...prompt, content: value }))
    },
    [updateActivePromptLocally],
  )

  const handleVariableUpdate = useCallback(
    (id: string, value: string) => {
      updateActivePromptLocally((prompt) => ({
        ...prompt,
        variables: prompt.variables.map((variable) =>
          variable.id === id ? { ...variable, value } : variable,
        ),
      }))
      setNotice('变量已更新，点击“保存”可写入本地存储。')
    },
    [updateActivePromptLocally],
  )

  const handleVariableInsert = useCallback(
    (label: string) => {
      updateActivePromptLocally((prompt) => ({
        ...prompt,
        content: prompt.content.endsWith(' ') ? `${prompt.content}{{${label}}}` : `${prompt.content} {{${label}}}`,
      }))
      setActiveTab('编辑器')
      setNotice(`已插入变量：${label}`)
    },
    [updateActivePromptLocally],
  )

  const handleKnowledgeInsert = useCallback(
    (term: KnowledgeTerm) => {
      updateActivePromptLocally((prompt) => ({
        ...prompt,
        content: `${prompt.content}\n${term.name}：${term.description}`,
      }))
      setActiveTab('编辑器')
      setNotice(`已插入知识库术语：${term.name}`)
    },
    [updateActivePromptLocally],
  )

  const handleImport = useCallback(() => {
    if (activePrompt == null) {
      setNotice('请先选择或新建一个 Prompt 再导入内容。')
      return
    }
    updateActivePromptLocally((prompt) => ({
      ...prompt,
      content: `${prompt.content}\n导入内容：请在这里粘贴外部 Prompt 并继续编辑。`,
    }))
    setActiveTab('编辑器')
    setNotice('已进入本地导入模式，可直接粘贴 Prompt 内容。')
  }, [activePrompt, updateActivePromptLocally])

  const handleShare = useCallback(() => {
    setActiveTab('分享')
    setNotice('已生成本地分享摘要，后续可接入 Tauri 后端生成分享文件或链接。')
  }, [])

  const handleSave = useCallback(async () => {
    if (activePrompt == null) {
      setNotice('当前没有可保存的 Prompt。')
      return
    }
    setIsSaving(true)
    try {
      const next = await updatePromptRequest({
        id: activePrompt.id,
        title: activePrompt.title,
        folderId: activePrompt.folderId,
        category: activePrompt.category,
        content: activePrompt.content,
        variables: activePrompt.variables,
        updatedAt: nowISO(),
      })
      setWorkspace(next)
      setNotice('Prompt 已保存到本地工作区。')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`保存失败：${message}`)
    } finally {
      setIsSaving(false)
    }
  }, [activePrompt])

  const handleCreatePrompt = useCallback(async () => {
    const folderForNewPrompt =
      activeFolder !== 'all' ? activeFolder : pickFallbackFolderId(workspace.folders)
    const id = generatePromptId('prompt')
    try {
      const next = await createPromptRequest({
        id,
        title: '未命名 Prompt',
        folderId: folderForNewPrompt,
        category: '未分类',
        content: '请描述你的创作目标、对象、风格、镜头、参数和输出要求。',
        variables: [],
        versionId: 'v1.0',
        createdAt: nowISO(),
      })
      setWorkspace(next)
      setActiveTab('编辑器')
      setNotice('已新建 Prompt 草稿，可在编辑器中继续完善。')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`新建 Prompt 失败：${message}`)
    }
  }, [activeFolder, workspace.folders])

  const handleRenamePrompt = useCallback(async () => {
    if (activePrompt == null) return
    const nextTitle = window.prompt('请输入新的 Prompt 标题', activePrompt.title)
    if (nextTitle == null) return
    const trimmed = nextTitle.trim()
    if (trimmed.length === 0) {
      setNotice('Prompt 标题不能为空。')
      return
    }
    try {
      const next = await updatePromptRequest({ id: activePrompt.id, title: trimmed, updatedAt: nowISO() })
      setWorkspace(next)
      setNotice(`Prompt 标题已更新为「${trimmed}」。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`重命名失败：${message}`)
    }
  }, [activePrompt])

  const handleDeletePrompt = useCallback(
    async (id: string) => {
      const target = workspace.prompts.find((prompt) => prompt.id === id)
      if (target == null) return
      const confirmed = window.confirm(`确认把「${target.title}」移动到回收站？`)
      if (!confirmed) return
      try {
        const next = await deletePromptRequest(id)
        setWorkspace(next)
        setNotice(`已将「${target.title}」移动到回收站。`)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        setNotice(`删除失败：${message}`)
      }
    },
    [workspace.prompts],
  )

  const handleRestorePrompt = useCallback(async (id: string) => {
    try {
      const next = await restorePromptRequest(id)
      setWorkspace(next)
      setActiveNav('prompts')
      setActiveTab('编辑器')
      const restored = next.prompts.find((prompt) => prompt.id === id)
      if (restored != null) setNotice(`已从回收站恢复：「${restored.title}」。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`恢复失败：${message}`)
    }
  }, [])

  const handlePurgePrompt = useCallback(
    async (entry: TrashEntry) => {
      const confirmed = window.confirm(`确认永久删除「${entry.prompt.title}」？此操作不可撤销。`)
      if (!confirmed) return
      try {
        const next = await purgePromptRequest(entry.prompt.id)
        setWorkspace(next)
        setNotice(`已永久删除「${entry.prompt.title}」。`)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        setNotice(`永久删除失败：${message}`)
      }
    },
    [],
  )

  const handleCommitVersion = useCallback(async () => {
    if (activePrompt == null) {
      setNotice('请先选择 Prompt 再提交版本。')
      return
    }
    const suggestedId = buildNextVersionId(activePrompt.versions)
    const versionId = window.prompt('请输入新的版本号（例如 v3.3）', suggestedId)
    if (versionId == null) return
    const trimmedId = versionId.trim()
    if (trimmedId.length === 0) {
      setNotice('版本号不能为空。')
      return
    }
    if (activePrompt.versions.some((version) => version.id === trimmedId)) {
      setNotice(`版本号已存在：${trimmedId}`)
      return
    }
    const title = window.prompt('请输入版本标题', '迭代版本')
    if (title == null) return
    const trimmedTitle = title.trim()
    if (trimmedTitle.length === 0) {
      setNotice('版本标题不能为空。')
      return
    }
    try {
      const next = await commitPromptVersion({
        promptId: activePrompt.id,
        versionId: trimmedId,
        title: trimmedTitle,
        date: nowISO(),
        parentId: activePrompt.activeVersionId,
        branch: false,
      })
      setWorkspace(next)
      setNotice(`版本 ${trimmedId} 已提交。`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`提交版本失败：${message}`)
    }
  }, [activePrompt])

  const handleCheckoutVersion = useCallback(
    async (version: PromptVersionRecord) => {
      if (activePrompt == null) return
      if (version.id === activePrompt.activeVersionId) {
        setNotice(`已在版本 ${version.id}。`)
        return
      }
      const confirmed = window.confirm(`切换到版本「${version.id} ${version.title}」会覆盖当前编辑内容，是否继续？`)
      if (!confirmed) return
      try {
        const next = await checkoutPromptVersion({
          promptId: activePrompt.id,
          versionId: version.id,
          updatedAt: nowISO(),
        })
        setWorkspace(next)
        setActiveTab('编辑器')
        setNotice(`已切回版本 ${version.id}：${version.title}。`)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        setNotice(`切换版本失败：${message}`)
      }
    },
    [activePrompt],
  )

  const handleCreateFolder = useCallback(async () => {
    const name = window.prompt('请输入新文件夹名称', '新建分组')
    if (name == null) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNotice('文件夹名称不能为空。')
      return
    }
    const id = generateFolderId(trimmed)
    try {
      const next = await createFolderRequest({ id, name: trimmed })
      setWorkspace(next)
      setActiveFolder(id)
      setNotice(`已新建文件夹：${trimmed}`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`新建文件夹失败：${message}`)
    }
  }, [])

  const handleDeleteFolder = useCallback(
    async (folder: FolderRecord) => {
      if (folder.system) {
        setNotice('系统文件夹无法删除。')
        return
      }
      const confirmed = window.confirm(`删除文件夹「${folder.name}」，其下的 Prompt 会被移动到其他文件夹，是否继续？`)
      if (!confirmed) return
      try {
        const next = await deleteFolderRequest(folder.id)
        setWorkspace(next)
        if (activeFolder === folder.id) setActiveFolder('all')
        setNotice(`已删除文件夹：${folder.name}`)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        setNotice(`删除文件夹失败：${message}`)
      }
    },
    [activeFolder],
  )

  const handleGeneratePlan = useCallback(() => {
    setPlanSteps((items) => items.map((item) => ({ ...item, done: true })))
    setMessages((items) => [
      ...items.filter((message) => message.status !== 'generating'),
      {
        id: `plan-${Date.now()}`,
        role: 'assistant',
        content: '已基于当前 Prompt 生成计划：明确目标、补齐变量、强化镜头语言、检查参数一致性。',
      },
    ])
    setNotice('AI 生成计划已在本地完成，后续将接入 Langfuse / LLM。')
  }, [])

  const handleSendAssistantMessage = useCallback(() => {
    const content = assistantInput.trim()
    if (content.length === 0) return
    setMessages((items) => [
      ...items.filter((message) => message.status !== 'generating'),
      { id: `u-${Date.now()}`, role: 'user', content },
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `已根据“${content}”生成本地优化建议：建议补充目标受众、输出格式、约束条件，并把关键参数变量化。`,
      },
    ])
    setAssistantInput('')
    setNotice('AI 助手已返回本地优化建议。')
  }, [assistantInput])

  const isTrashView = activeNav === 'trash'

  return (
    <main className="app-shell">
      <aside className="brand-panel" aria-label="产品功能概览">
        <div className="brand-header">
          <div className="brand-mark">P</div>
          <div>
            <h1>PromptCraft</h1>
            <p>专业 Prompt 工作台</p>
          </div>
        </div>
        <FeatureList />
        <div className="tech-stack" aria-label="技术栈">
          {['Tauri 2.0', 'React', 'TypeScript', 'Langfuse', 'Rust'].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </aside>

      <section className="workspace-frame" aria-label="PromptCraft 工作台">
        <aside className="app-sidebar">
          <div className="app-logo">
            <div className="mini-mark">P</div>
            <strong>PromptCraft</strong>
          </div>
          <nav className="primary-nav" aria-label="主导航">
            {navigationItems.map((item) => (
              <button
                className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                type="button"
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.id === 'trash' && workspace.trash.length > 0 && <b>{workspace.trash.length}</b>}
              </button>
            ))}
          </nav>
          <div className="folder-section">
            <div className="section-title-row">
              <span>文件夹</span>
              <button aria-label="新建文件夹" onClick={() => void handleCreateFolder()} type="button">
                <Plus size={15} />
              </button>
            </div>
            {visibleFolders.map((folder) => {
              const count = folder.id === 'all' ? totalPrompts : folderCounts.get(folder.id) ?? 0
              return (
                <div className={folder.id === activeFolder ? 'folder-item active' : 'folder-item'} key={folder.id}>
                  <button className="folder-trigger" onClick={() => setActiveFolder(folder.id)} type="button">
                    <Folder size={16} />
                    <span>{folder.name}</span>
                    <b>{count}</b>
                  </button>
                  {!folder.system && (
                    <button
                      aria-label={`删除文件夹 ${folder.name}`}
                      className="folder-delete"
                      onClick={() => void handleDeleteFolder(folder)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <PromptListSection
            prompts={folderPrompts}
            activePromptId={workspace.activePromptId}
            folderName={currentFolderName}
            onSelect={handlePromptSwitch}
            onDelete={handleDeletePrompt}
          />
          <UsageCard />
        </aside>

        <section className="main-column">
          <header className="top-bar">
            <label className="search-box" aria-label="搜索 Prompt 或变量">
              <Search size={16} />
              <input
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索 Prompt 或变量..."
                value={searchText}
              />
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-actions">
              <button className="secondary-button" onClick={handleImport} type="button">
                <Import size={16} />
                导入
              </button>
              <button
                className="secondary-button"
                disabled={isSaving || activePrompt == null}
                onClick={() => void handleSave()}
                type="button"
              >
                <Check size={16} />
                {isSaving ? '保存中' : '保存'}
              </button>
              <button className="primary-button" onClick={() => void handleCreatePrompt()} type="button">
                <Plus size={16} />
                新建 Prompt
              </button>
              <button className="icon-button" onClick={handleShare} type="button" aria-label="分享 Prompt">
                <Share2 size={16} />
              </button>
              <div className="avatar" aria-label="当前用户" />
            </div>
          </header>

          {isTrashView ? (
            <TrashView
              entries={workspace.trash}
              onRestore={(entry) => void handleRestorePrompt(entry.prompt.id)}
              onPurge={(entry) => void handlePurgePrompt(entry)}
            />
          ) : (
            <PromptArea
              isLoading={isLoading}
              notice={notice}
              activePrompt={activePrompt}
              currentFolderName={currentFolderName}
              activeTab={activeTab}
              tabs={tabs}
              onTabSelect={setActiveTab}
              onContentChange={handlePromptContentChange}
              onVariableUpdate={handleVariableUpdate}
              onVariableInsert={handleVariableInsert}
              onRename={handleRenamePrompt}
              onShare={handleShare}
              onCommitVersion={handleCommitVersion}
              onCheckoutVersion={handleCheckoutVersion}
              messages={messages}
              assistantInput={assistantInput}
              onAssistantInputChange={setAssistantInput}
              onSendAssistantMessage={handleSendAssistantMessage}
              onCreatePrompt={handleCreatePrompt}
            />
          )}
        </section>

        <aside className="insight-panel">
          <VersionTimeline
            items={activePrompt?.versions ?? []}
            activeVersion={activePrompt?.activeVersionId ?? ''}
            onSelect={handleCheckoutVersion}
            onCommit={handleCommitVersion}
            canCommit={activePrompt != null}
          />
          <KnowledgePanel
            activeCategory={activeKnowledgeCategory}
            query={knowledgeQuery}
            terms={filteredTerms}
            onCategory={setActiveKnowledgeCategory}
            onInsert={handleKnowledgeInsert}
            onQuery={setKnowledgeQuery}
          />
          <PlanPanel steps={planSteps} onGenerate={handleGeneratePlan} />
        </aside>
      </section>
    </main>
  )
}

function FeatureList(): ReactElement {
  const features = [
    { icon: Share2, title: '版本与分支', text: '追溯 Prompt 演进。' },
    { icon: Variable, title: '变量插入', text: '复用关键参数。' },
    { icon: MessageSquareText, title: 'AI 引导', text: '逐步补齐需求。' },
    { icon: Database, title: '术语知识库', text: '沉淀专业表达。' },
  ]

  return (
    <div className="feature-list">
      {features.map((feature, index) => (
        <article className="feature-card" key={feature.title}>
          <div className="feature-index">{index + 1}</div>
          <feature.icon size={24} />
          <div>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

function UsageCard(): ReactElement {
  const points = usagePointSamples
    .map((point, index) => `${(index / (usagePointSamples.length - 1)) * 100},${70 - point}`)
    .join(' ')

  return (
    <article className="usage-card">
      <h3>今日使用统计</h3>
      <div className="usage-grid">
        <span>生成</span>
        <strong>23 次</strong>
        <span>调用变量</span>
        <strong>56 次</strong>
      </div>
      <svg viewBox="0 0 100 70" role="img" aria-label="今日使用趋势图">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    </article>
  )
}

function PromptListSection({
  prompts,
  activePromptId,
  folderName,
  onSelect,
  onDelete,
}: {
  prompts: PromptRecord[]
  activePromptId: string | null
  folderName: string
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}): ReactElement {
  return (
    <section className="prompts-section" aria-label={`${folderName} Prompt 列表`}>
      <div className="section-title-row">
        <span>Prompt · {folderName}</span>
        <small>{prompts.length}</small>
      </div>
      <div className="prompt-list">
        {prompts.length === 0 ? (
          <div className="empty-state compact-empty">
            <FileText size={18} />
            <p>该文件夹暂无 Prompt，点击右上角“新建 Prompt”开始。</p>
          </div>
        ) : (
          prompts.map((prompt) => (
            <div className={prompt.id === activePromptId ? 'prompt-item active' : 'prompt-item'} key={prompt.id}>
              <button className="prompt-trigger" onClick={() => onSelect(prompt.id)} type="button">
                <FileText size={14} />
                <span>{prompt.title}</span>
                <small>{prompt.activeVersionId}</small>
              </button>
              <button
                aria-label={`删除 ${prompt.title}`}
                className="prompt-delete"
                onClick={() => onDelete(prompt.id)}
                type="button"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function PromptArea({
  isLoading,
  notice,
  activePrompt,
  currentFolderName,
  activeTab,
  tabs: tabList,
  onTabSelect,
  onContentChange,
  onVariableUpdate,
  onVariableInsert,
  onRename,
  onShare,
  onCommitVersion,
  onCheckoutVersion,
  messages,
  assistantInput,
  onAssistantInputChange,
  onSendAssistantMessage,
  onCreatePrompt,
}: {
  isLoading: boolean
  notice: string
  activePrompt: PromptRecord | undefined
  currentFolderName: string
  activeTab: TabName
  tabs: readonly TabName[]
  onTabSelect: (tab: TabName) => void
  onContentChange: (value: string) => void
  onVariableUpdate: (id: string, value: string) => void
  onVariableInsert: (label: string) => void
  onRename: () => void
  onShare: () => void
  onCommitVersion: () => void
  onCheckoutVersion: (version: PromptVersionRecord) => void
  messages: AssistantMessage[]
  assistantInput: string
  onAssistantInputChange: (value: string) => void
  onSendAssistantMessage: () => void
  onCreatePrompt: () => void
}): ReactElement {
  if (isLoading) {
    return (
      <section className="prompt-area" aria-busy>
        <div className="status-line">{notice}</div>
        <div className="empty-state">
          <Sparkles size={28} />
          <p>正在加载本地工作区...</p>
        </div>
      </section>
    )
  }

  if (activePrompt == null) {
    return (
      <section className="prompt-area">
        <div className="status-line">{notice}</div>
        <div className="empty-state">
          <FileText size={28} />
          <p>当前没有选中的 Prompt，可点击右上角“新建 Prompt”或在左侧列表中选择。</p>
          <button className="primary-button" onClick={onCreatePrompt} type="button">
            <Plus size={16} />
            新建 Prompt
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="prompt-area">
      <div className="status-line">{notice}</div>
      <div className="prompt-heading">
        <div>
          <div className="title-line">
            <h2>{activePrompt.title}</h2>
            <span>{activePrompt.activeVersionId}</span>
            <small>{currentFolderName}</small>
            <button aria-label="重命名 Prompt" className="heading-action" onClick={onRename} type="button">
              重命名
            </button>
          </div>
          <p>
            创建于 {formatDateCN(activePrompt.createdAt)} · 更新于 {formatDateCN(activePrompt.updatedAt)}
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Prompt 操作标签">
        {tabList.map((tab) => (
          <button
            className={activeTab === tab ? 'tab active' : 'tab'}
            key={tab}
            onClick={() => onTabSelect(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <section className="editor-card" aria-label="Prompt 编辑器">
        {activeTab === '编辑器' && (
          <textarea
            className="prompt-textarea"
            onChange={(event) => onContentChange(event.target.value)}
            value={activePrompt.content}
          />
        )}
        {activeTab === '历史版本' && (
          <VersionTabPanel
            versions={activePrompt.versions}
            activeVersionId={activePrompt.activeVersionId}
            onSelect={onCheckoutVersion}
            onCommit={onCommitVersion}
          />
        )}
        {activeTab === '变量' && (
          <VariableEditor variables={activePrompt.variables} onInsert={onVariableInsert} onUpdate={onVariableUpdate} />
        )}
        {activeTab === '分享' && <SharePanel promptText={activePrompt.content} onShare={onShare} />}
        {activeTab === '设置' && <SettingsPanel />}
      </section>

      <AssistantCard
        messages={messages}
        input={assistantInput}
        onInput={onAssistantInputChange}
        onSend={onSendAssistantMessage}
      />
    </section>
  )
}

function TrashView({
  entries,
  onRestore,
  onPurge,
}: {
  entries: TrashEntry[]
  onRestore: (entry: TrashEntry) => void
  onPurge: (entry: TrashEntry) => void
}): ReactElement {
  return (
    <section className="prompt-area trash-area" aria-label="回收站">
      <div className="status-line">回收站中保留最近删除的 Prompt，可恢复或永久删除。</div>
      <div className="trash-list">
        {entries.length === 0 ? (
          <div className="empty-state">
            <Trash2 size={28} />
            <p>回收站为空。</p>
          </div>
        ) : (
          entries.map((entry) => (
            <article className="trash-item" key={entry.prompt.id}>
              <div>
                <h3>{entry.prompt.title}</h3>
                <p>
                  删除于 {formatDateCN(entry.deletedAt)} · 版本 {entry.prompt.activeVersionId} · 文件夹 {entry.prompt.folderId}
                </p>
              </div>
              <div className="trash-actions">
                <button className="secondary-button" onClick={() => onRestore(entry)} type="button">
                  <ArchiveRestore size={16} />
                  恢复
                </button>
                <button className="icon-button" onClick={() => onPurge(entry)} type="button" aria-label="永久删除">
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function VariableEditor({
  variables,
  onInsert,
  onUpdate,
}: {
  variables: PromptVariable[]
  onInsert: (label: string) => void
  onUpdate: (id: string, value: string) => void
}): ReactElement {
  if (variables.length === 0) {
    return (
      <div className="empty-state compact-empty">
        <Variable size={24} />
        <p>当前 Prompt 暂无变量，可先在内容中使用 {`{{变量名}}`} 标记。</p>
      </div>
    )
  }

  return (
    <div className="variable-editor">
      {variables.map((variable) => (
        <label className="variable-field" key={variable.id}>
          <span>{variable.label}</span>
          <input onChange={(event) => onUpdate(variable.id, event.target.value)} value={variable.value} />
          <button onClick={() => onInsert(variable.label)} type="button">
            插入
          </button>
        </label>
      ))}
    </div>
  )
}

function SharePanel({ promptText, onShare }: { promptText: string; onShare: () => void }): ReactElement {
  return (
    <div className="share-panel">
      <h3>分享预览</h3>
      <p>
        {promptText.slice(0, 120)}
        {promptText.length > 120 ? '...' : ''}
      </p>
      <button className="secondary-button" onClick={onShare} type="button">
        生成分享摘要
      </button>
    </div>
  )
}

function SettingsPanel(): ReactElement {
  return (
    <div className="settings-panel">
      <h3>本地设置</h3>
      <div>
        <span>知识库模式</span>
        <strong>Langfuse 边界预留</strong>
      </div>
      <div>
        <span>密钥策略</span>
        <strong>仅允许后端安全配置</strong>
      </div>
      <div>
        <span>编辑模式</span>
        <strong>本地即时更新</strong>
      </div>
    </div>
  )
}

function AssistantCard({
  messages,
  input,
  onInput,
  onSend,
}: {
  messages: AssistantMessage[]
  input: string
  onInput: (value: string) => void
  onSend: () => void
}): ReactElement {
  return (
    <section className="assistant-card" aria-label="AI 助手">
      <div className="assistant-header">
        <div>
          <Sparkles size={18} />
          <h3>AI 助手</h3>
        </div>
        <button aria-label="关闭 AI 助手" type="button">
          <X size={17} />
        </button>
      </div>
      <div className="chat-list">
        {messages.map((message) => (
          <div className={`chat-row ${message.role}`} key={message.id}>
            {message.role === 'assistant' && (
              <div className="assistant-avatar">
                <Sparkles size={13} />
              </div>
            )}
            <div className={message.status === 'generating' ? 'chat-bubble generating' : 'chat-bubble'}>
              {message.content}
            </div>
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          onChange={(event) => onInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSend()
          }}
          placeholder="输入你的需求..."
          value={input}
        />
        <button aria-label="发送需求" onClick={onSend} type="button">
          <Send size={17} />
        </button>
      </div>
    </section>
  )
}

function VersionTimeline({
  items,
  activeVersion,
  onSelect,
  onCommit,
  canCommit,
}: {
  items: PromptVersionRecord[]
  activeVersion: string
  onSelect: (version: PromptVersionRecord) => void
  onCommit: () => void
  canCommit: boolean
}): ReactElement {
  return (
    <section className="panel-card version-card" aria-label="历史版本与分支">
      <div className="section-title-row">
        <h3>历史版本与分支</h3>
        <button disabled={!canCommit} onClick={onCommit} type="button">
          <GitCommit size={14} />
          提交版本
        </button>
      </div>
      <div className="timeline">
        {items.length === 0 ? (
          <div className="empty-state compact-empty">
            <CircleDot size={20} />
            <p>选择 Prompt 后即可查看版本历史。</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              className={`version-item ${activeVersion === item.id ? 'active' : ''} ${item.branch ? 'branch' : ''}`}
              key={item.id}
              onClick={() => onSelect(item)}
              type="button"
            >
              <CircleDot size={16} />
              <div>
                <strong>{item.id}</strong>
                <span>{item.title}</span>
              </div>
              <time>{formatDateCN(item.date)}</time>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

function VersionTabPanel({
  versions,
  activeVersionId,
  onSelect,
  onCommit,
}: {
  versions: PromptVersionRecord[]
  activeVersionId: string
  onSelect: (version: PromptVersionRecord) => void
  onCommit: () => void
}): ReactElement {
  return (
    <div className="version-tab-panel">
      <div className="version-tab-header">
        <p>选择历史版本可覆盖当前编辑内容，提交版本会把当前内容快照保存。</p>
        <button className="secondary-button" onClick={onCommit} type="button">
          <GitCommit size={14} />
          提交当前为新版本
        </button>
      </div>
      <div className="version-inline timeline">
        {versions.length === 0 ? (
          <div className="empty-state compact-empty">
            <CircleDot size={20} />
            <p>暂无历史版本，可点击右上角“提交当前为新版本”。</p>
          </div>
        ) : (
          versions.map((item) => (
            <button
              className={`version-item ${activeVersionId === item.id ? 'active' : ''} ${item.branch ? 'branch' : ''}`}
              key={item.id}
              onClick={() => onSelect(item)}
              type="button"
            >
              <CircleDot size={16} />
              <div>
                <strong>{item.id}</strong>
                <span>{item.title}</span>
              </div>
              <time>{formatDateCN(item.date)}</time>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function KnowledgePanel({
  activeCategory,
  query,
  terms,
  onCategory,
  onInsert,
  onQuery,
}: {
  activeCategory: KnowledgeCategory
  query: string
  terms: KnowledgeTerm[]
  onCategory: (category: KnowledgeCategory) => void
  onInsert: (term: KnowledgeTerm) => void
  onQuery: (value: string) => void
}): ReactElement {
  return (
    <section className="panel-card knowledge-card" aria-label="知识库">
      <div className="section-title-row">
        <h3>知识库</h3>
        <Settings size={16} />
      </div>
      <label className="knowledge-search">
        <Search size={15} />
        <input onChange={(event) => onQuery(event.target.value)} placeholder="搜索名词..." value={query} />
      </label>
      <div className="category-row">
        {knowledgeCategories.map((category) => (
          <button
            className={category === activeCategory ? 'active' : ''}
            key={category}
            onClick={() => onCategory(category)}
            type="button"
          >
            {category}
          </button>
        ))}
      </div>
      <div className="term-list">
        {terms.length > 0 ? (
          terms.map((term) => (
            <button className="term-item" key={term.id} onClick={() => onInsert(term)} type="button">
              <h4>{term.name}</h4>
              <p>{term.description}</p>
            </button>
          ))
        ) : (
          <div className="empty-state">
            <BookOpen size={24} />
            <p>暂无匹配术语，可调整分类或搜索词。</p>
          </div>
        )}
      </div>
    </section>
  )
}

function PlanPanel({ steps, onGenerate }: { steps: GenerationStep[]; onGenerate: () => void }): ReactElement {
  return (
    <section className="panel-card plan-card" aria-label="AI 生成计划">
      <div className="section-title-row">
        <h3>AI 生成 Plan</h3>
        <button onClick={onGenerate} type="button">
          生成计划
        </button>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <span>
              {index + 1}. {step.label}
            </span>
            {step.done ? <Check size={16} /> : <ChevronRight size={16} />}
          </li>
        ))}
      </ol>
    </section>
  )
}

export default App
