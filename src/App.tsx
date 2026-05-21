import {
  BookOpen,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  FileText,
  Folder,
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
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  assistantMessages,
  folders,
  generationSteps,
  knowledgeCategories,
  knowledgeTerms,
  promptItem,
  usagePoints,
  versions,
} from './data/promptCraftData'
import { loadPromptDraft, savePromptDraft, type PromptDraft } from './services/promptStorage'
import type { AssistantMessage, GenerationStep, KnowledgeCategory, KnowledgeTerm, PromptVariable, PromptVersion } from './types/prompt'

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

function formatDateCN(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function createPromptText(variables: PromptVariable[]): string {
  return promptItem.contentSegments
    .map((segment) => {
      if (segment.kind === 'text') return segment.value
      const variable = variables.find((item) => item.label === segment.value)
      return `{{${variable?.label ?? segment.value}}}`
    })
    .join('')
}

function App(): ReactElement {
  const [activeNav, setActiveNav] = useState<NavigationId>('prompts')
  const [activeFolder, setActiveFolder] = useState('all')
  const [activeTab, setActiveTab] = useState<TabName>('编辑器')
  const [activeKnowledgeCategory, setActiveKnowledgeCategory] = useState<KnowledgeCategory>('全部')
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [messages, setMessages] = useState<AssistantMessage[]>(assistantMessages)
  const [assistantInput, setAssistantInput] = useState('')
  const [variables, setVariables] = useState<PromptVariable[]>(promptItem.variables)
  const [promptText, setPromptText] = useState(() => createPromptText(promptItem.variables))
  const [activeVersion, setActiveVersion] = useState(promptItem.version)
  const [planSteps, setPlanSteps] = useState<GenerationStep[]>(generationSteps)
  const [notice, setNotice] = useState('已加载本地工作台，可直接编辑 Prompt、变量、版本和知识库。')
  const [searchText, setSearchText] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadPromptDraft()
      .then((draft) => {
        if (draft == null) return
        setPromptText(draft.content)
        setVariables(draft.variables)
        setActiveFolder(draft.folderId)
        setActiveVersion(draft.version)
        setNotice(`已恢复本地草稿：${draft.title}`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        setNotice(`草稿加载失败：${message}`)
      })
  }, [])

  const currentDraft = useMemo<PromptDraft>(() => {
    return {
      id: promptItem.id,
      title: promptItem.title,
      folderId: activeFolder,
      version: activeVersion,
      content: promptText,
      variables,
      updatedAt: new Date().toISOString(),
    }
  }, [activeFolder, activeVersion, promptText, variables])

  const filteredTerms = useMemo(() => {
    return knowledgeTerms.filter((term) => {
      const matchesCategory = activeKnowledgeCategory === '全部' || term.category === activeKnowledgeCategory
      const query = knowledgeQuery.trim().toLowerCase()
      const matchesQuery = query.length === 0 || term.name.toLowerCase().includes(query) || term.description.toLowerCase().includes(query)
      return matchesCategory && matchesQuery
    })
  }, [activeKnowledgeCategory, knowledgeQuery])

  const visibleFolders = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    if (query.length === 0) return folders
    return folders.filter((folder) => folder.name.toLowerCase().includes(query) || promptItem.title.toLowerCase().includes(query))
  }, [searchText])

  const currentFolder = folders.find((folder) => folder.id === activeFolder) ?? folders[0]

  const updateVariable = (id: string, value: string): void => {
    setVariables((items) => items.map((item) => (item.id === id ? { ...item, value } : item)))
    setNotice('变量已更新，本地编辑状态已同步。')
  }

  const insertVariable = (label: string): void => {
    setPromptText((value) => `${value}${value.endsWith('') ? '' : ' '}{{${label}}}`)
    setActiveTab('编辑器')
    setNotice(`已插入变量：${label}`)
  }

  const insertKnowledgeTerm = (term: KnowledgeTerm): void => {
    setPromptText((value) => `${value}\n${term.name}：${term.description}`)
    setActiveTab('编辑器')
    setNotice(`已插入知识库术语：${term.name}`)
  }

  const switchVersion = (version: PromptVersion): void => {
    setActiveVersion(version.id)
    setNotice(`已切换到 ${version.id}：${version.title}`)
  }

  const createNewPrompt = (): void => {
    setPromptText('请描述你的创作目标、对象、风格、镜头、参数和输出要求。')
    setVariables([])
    setActiveTab('编辑器')
    setNotice('已创建新的本地 Prompt 草稿。')
  }

  const importPrompt = (): void => {
    setPromptText((value) => `${value}\n导入内容：请在这里粘贴外部 Prompt 并继续编辑。`)
    setActiveTab('编辑器')
    setNotice('已进入本地导入模式，可直接粘贴 Prompt 内容。')
  }

  const sharePrompt = (): void => {
    setActiveTab('分享')
    setNotice('已生成本地分享摘要，后续可接入 Tauri 后端生成分享文件或链接。')
  }

  const persistDraft = async (): Promise<void> => {
    setIsSaving(true)
    try {
      await savePromptDraft(currentDraft)
      setNotice('Prompt 草稿已保存到本地应用数据目录。')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setNotice(`Prompt 草稿保存失败：${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const generatePlan = (): void => {
    setPlanSteps((items) => items.map((item) => ({ ...item, done: true })))
    setMessages((items) => [
      ...items.filter((message) => message.status !== 'generating'),
      { id: `plan-${Date.now()}`, role: 'assistant', content: '已基于当前 Prompt 生成计划：明确目标、补齐变量、强化镜头语言、检查参数一致性。' },
    ])
    setNotice('AI 生成计划已在本地完成。')
  }

  const sendAssistantMessage = (): void => {
    const content = assistantInput.trim()
    if (content.length === 0) return

    const nextMessages: AssistantMessage[] = [
      ...messages.filter((message) => message.status !== 'generating'),
      { id: `u-${Date.now()}`, role: 'user', content },
      {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: `已根据“${content}”生成本地优化建议：建议补充目标受众、输出格式、约束条件，并把关键参数变量化。`,
      },
    ]

    setMessages(nextMessages)
    setAssistantInput('')
    setNotice('AI 助手已返回本地优化建议。')
  }

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
              <button className={activeNav === item.id ? 'nav-item active' : 'nav-item'} key={item.id} onClick={() => setActiveNav(item.id)} type="button">
                <item.icon size={17} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="folder-section">
            <div className="section-title-row">
              <span>文件夹</span>
              <button aria-label="新建文件夹" onClick={() => setNotice('本地文件夹创建入口已触发，后续可接入持久化。')} type="button">
                <Plus size={15} />
              </button>
            </div>
            {visibleFolders.map((folder) => (
              <button className={folder.id === activeFolder ? 'folder-item active' : 'folder-item'} key={folder.id} onClick={() => setActiveFolder(folder.id)} type="button">
                <Folder size={16} />
                <span>{folder.name}</span>
                <b>{folder.count}</b>
              </button>
            ))}
          </div>
          <UsageCard />
        </aside>

        <section className="main-column">
          <header className="top-bar">
            <label className="search-box" aria-label="搜索 Prompt 或变量">
              <Search size={16} />
              <input onChange={(event) => setSearchText(event.target.value)} placeholder="搜索 Prompt 或变量..." value={searchText} />
              <kbd>⌘ K</kbd>
            </label>
            <div className="top-actions">
              <button className="secondary-button" onClick={importPrompt} type="button">
                <Import size={16} />
                导入
              </button>
              <button className="secondary-button" disabled={isSaving} onClick={() => void persistDraft()} type="button">
                <Check size={16} />
                {isSaving ? '保存中' : '保存'}
              </button>
              <button className="primary-button" onClick={createNewPrompt} type="button">
                <Plus size={16} />
                新建 Prompt
              </button>
              <button className="icon-button" onClick={sharePrompt} type="button" aria-label="分享 Prompt">
                <Share2 size={16} />
              </button>
              <div className="avatar" aria-label="当前用户" />
            </div>
          </header>

          <section className="prompt-area">
            <div className="status-line">{notice}</div>
            <div className="prompt-heading">
              <div>
                <div className="title-line">
                  <h2>{promptItem.title}</h2>
                  <span>{activeVersion}</span>
                  <small>{currentFolder.name}</small>
                </div>
                <p>创建于 {formatDateCN(promptItem.createdAt)} · 更新于 {formatDateCN(promptItem.updatedAt)}</p>
              </div>
            </div>
            <div className="tabs" role="tablist" aria-label="Prompt 操作标签">
              {tabs.map((tab) => (
                <button className={activeTab === tab ? 'tab active' : 'tab'} key={tab} onClick={() => setActiveTab(tab)} type="button">
                  {tab}
                </button>
              ))}
            </div>

            <section className="editor-card" aria-label="Prompt 编辑器">
              {activeTab === '编辑器' && <textarea className="prompt-textarea" onChange={(event) => setPromptText(event.target.value)} value={promptText} />}
              {activeTab === '历史版本' && <VersionTimeline items={versions} activeVersion={activeVersion} onSelect={switchVersion} compact />}
              {activeTab === '变量' && <VariableEditor variables={variables} onInsert={insertVariable} onUpdate={updateVariable} />}
              {activeTab === '分享' && <SharePanel promptText={promptText} onShare={sharePrompt} />}
              {activeTab === '设置' && <SettingsPanel />}
            </section>

            <AssistantCard messages={messages} input={assistantInput} onInput={setAssistantInput} onSend={sendAssistantMessage} />
          </section>
        </section>

        <aside className="insight-panel">
          <VersionTimeline items={versions} activeVersion={activeVersion} onSelect={switchVersion} />
          <KnowledgePanel
            activeCategory={activeKnowledgeCategory}
            query={knowledgeQuery}
            terms={filteredTerms}
            onCategory={setActiveKnowledgeCategory}
            onInsert={insertKnowledgeTerm}
            onQuery={setKnowledgeQuery}
          />
          <PlanPanel steps={planSteps} onGenerate={generatePlan} />
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
  const points = usagePoints.map((point, index) => `${(index / (usagePoints.length - 1)) * 100},${70 - point.value}`).join(' ')

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

function VariableEditor({ variables, onInsert, onUpdate }: { variables: PromptVariable[]; onInsert: (label: string) => void; onUpdate: (id: string, value: string) => void }): ReactElement {
  if (variables.length === 0) {
    return (
      <div className="empty-state compact-empty">
        <Variable size={24} />
        <p>当前草稿暂无变量，可先在 Prompt 中使用 {`{{变量名}}`} 标记。</p>
      </div>
    )
  }

  return (
    <div className="variable-editor">
      {variables.map((variable) => (
        <label className="variable-field" key={variable.id}>
          <span>{variable.label}</span>
          <input onChange={(event) => onUpdate(variable.id, event.target.value)} value={variable.value} />
          <button onClick={() => onInsert(variable.label)} type="button">插入</button>
        </label>
      ))}
    </div>
  )
}

function SharePanel({ promptText, onShare }: { promptText: string; onShare: () => void }): ReactElement {
  return (
    <div className="share-panel">
      <h3>分享预览</h3>
      <p>{promptText.slice(0, 120)}{promptText.length > 120 ? '...' : ''}</p>
      <button className="secondary-button" onClick={onShare} type="button">生成分享摘要</button>
    </div>
  )
}

function SettingsPanel(): ReactElement {
  return (
    <div className="settings-panel">
      <h3>本地设置</h3>
      <div><span>知识库模式</span><strong>Langfuse 边界预留</strong></div>
      <div><span>密钥策略</span><strong>仅允许后端安全配置</strong></div>
      <div><span>编辑模式</span><strong>本地即时更新</strong></div>
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
            <div className={message.status === 'generating' ? 'chat-bubble generating' : 'chat-bubble'}>{message.content}</div>
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

function VersionTimeline({ items, activeVersion, onSelect, compact = false }: { items: PromptVersion[]; activeVersion: string; onSelect: (version: PromptVersion) => void; compact?: boolean }): ReactElement {
  return (
    <section className={compact ? 'version-inline' : 'panel-card version-card'} aria-label="历史版本与分支">
      <h3>历史版本与分支</h3>
      <div className="timeline">
        {items.map((item) => (
          <button className={`version-item ${activeVersion === item.id ? 'active' : ''} ${item.branch ? 'branch' : ''}`} key={item.id} onClick={() => onSelect(item)} type="button">
            <CircleDot size={16} />
            <div>
              <strong>{item.id}</strong>
              <span>{item.title}</span>
            </div>
            <time>{formatDateCN(item.date)}</time>
          </button>
        ))}
      </div>
    </section>
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
          <button className={category === activeCategory ? 'active' : ''} key={category} onClick={() => onCategory(category)} type="button">
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
        <button onClick={onGenerate} type="button">生成计划</button>
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
