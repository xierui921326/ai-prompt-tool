import type {
  AssistantMessage,
  FolderItem,
  GenerationStep,
  KnowledgeCategory,
  KnowledgeTerm,
  PromptItem,
  PromptVersion,
  UsagePoint,
} from '../types/prompt'

export const folders: FolderItem[] = [
  { id: 'all', name: '全部 Prompt', count: 128 },
  { id: 'photo', name: '摄影', count: 24 },
  { id: 'product', name: '产品设计', count: 18 },
  { id: 'copy', name: '文案写作', count: 15 },
  { id: 'agent', name: '智能体项目', count: 31 },
  { id: 'other', name: '其他', count: 40 },
]

export const promptItem: PromptItem = {
  id: 'urban-night-drone',
  title: '无人机航拍电影感的城市夜景',
  version: 'v3.2',
  createdAt: '2024-05-20T09:30:00+08:00',
  updatedAt: '2024-05-22T20:16:00+08:00',
  category: '摄影',
  contentSegments: [
    { id: 's1', kind: 'text', value: '请生成一段' },
    { id: 's2', kind: 'variable', value: '城市' },
    { id: 's3', kind: 'text', value: '夜景的航拍视频，风格为' },
    { id: 's4', kind: 'variable', value: '风格' },
    { id: 's5', kind: 'text', value: '，镜头语言使用' },
    { id: 's6', kind: 'variable', value: '镜头类型' },
    { id: 's7', kind: 'text', value: '，强调' },
    { id: 's8', kind: 'variable', value: '氛围' },
    { id: 's9', kind: 'text', value: '，画面中包含' },
    { id: 's10', kind: 'variable', value: '地标建筑' },
    { id: 's11', kind: 'text', value: '，使用' },
    { id: 's12', kind: 'variable', value: '动态虚化' },
    { id: 's13', kind: 'text', value: '效果，整体色调为' },
    { id: 's14', kind: 'variable', value: '色调' },
    { id: 's15', kind: 'text', value: '，分辨率' },
    { id: 's16', kind: 'variable', value: '分辨率' },
    { id: 's17', kind: 'text', value: '，时长' },
    { id: 's18', kind: 'variable', value: '时长' },
    { id: 's19', kind: 'text', value: '。' },
  ],
  variables: [
    { id: 'city', label: '城市', value: '上海', group: '场景' },
    { id: 'style', label: '风格', value: '电影感', group: '视觉' },
    { id: 'lens', label: '镜头类型', value: '无人机推轨', group: '镜头' },
    { id: 'mood', label: '氛围', value: '现代、冷静、大气', group: '情绪' },
    { id: 'landmark', label: '地标建筑', value: '陆家嘴天际线', group: '场景' },
    { id: 'motion', label: '动态虚化', value: '车流拖影', group: '运动' },
    { id: 'tone', label: '色调', value: '蓝黑与金色高光', group: '视觉' },
    { id: 'resolution', label: '分辨率', value: '4K', group: '参数' },
    { id: 'duration', label: '时长', value: '8秒', group: '参数' },
  ],
}

export const versions: PromptVersion[] = [
  { id: 'v1.0', title: '初始版本', date: '2024-05-20T10:00:00+08:00' },
  { id: 'v2.0', title: '调整镜头语言', date: '2024-05-21T11:10:00+08:00' },
  { id: 'v2.1', title: '增加动态虚化', date: '2024-05-21T14:20:00+08:00', parentId: 'v2.0', branch: true },
  { id: 'v2.2', title: '调整色调', date: '2024-05-21T16:50:00+08:00', parentId: 'v2.0', branch: true },
  { id: 'v3.0', title: '优化整体描述', date: '2024-05-22T09:30:00+08:00' },
  { id: 'v3.2', title: '当前版本', date: '2024-05-22T20:16:00+08:00', active: true },
]

export const knowledgeCategories: KnowledgeCategory[] = ['全部', '生成风格', '镜头语言', '动态虚化', '其他']

export const knowledgeTerms: KnowledgeTerm[] = [
  { id: 'cinematic', name: '电影感 Cinematic', category: '生成风格', description: '具有电影级叙事画面、色彩丰富、对比度强' },
  { id: 'cyberpunk', name: '赛博朋克 Cyberpunk', category: '生成风格', description: '未来科技感、霓虹灯光、高对比度、暗色调' },
  { id: 'macro', name: '微距镜头 Macro Shot', category: '镜头语言', description: '近距离拍摄，突出细节' },
  { id: 'telephoto', name: '长焦镜头 Telephoto', category: '镜头语言', description: '使用长焦镜头压缩空间，突出主体' },
  { id: 'motion', name: '动态模糊 Motion Blur', category: '动态虚化', description: '在运动中产生的模糊效果，增强动感' },
]

export const assistantMessages: AssistantMessage[] = [
  { id: 'a1', role: 'assistant', content: '我来帮你优化这个 Prompt。首先想了解一下，你希望这个视频的主要用途是什么？' },
  { id: 'u1', role: 'user', content: '用于城市宣传片，需要震撼、大气的感觉' },
  { id: 'a2', role: 'assistant', content: '好的！那你希望突显城市的哪些特色呢？比如现代建筑、历史文化、自然风光？' },
  { id: 'u2', role: 'user', content: '现代建筑为主，展现科技感和未来感。' },
  { id: 'a3', role: 'assistant', content: '明白了！我会为你优化 Prompt 并突出科技感和未来感的视觉效果。' },
  { id: 'a4', role: 'assistant', content: '正在生成优化建议...', status: 'generating' },
]

export const generationSteps: GenerationStep[] = [
  { id: 'g1', label: '分析需求与目标', done: true },
  { id: 'g2', label: '确定核心元素与风格', done: true },
  { id: 'g3', label: '构建 Prompt 结构', done: true },
  { id: 'g4', label: '优化细节与参数', done: true },
  { id: 'g5', label: '测试与调整', done: true },
]

export const usagePoints: UsagePoint[] = [
  { id: 'd1', value: 22 },
  { id: 'd2', value: 36 },
  { id: 'd3', value: 41 },
  { id: 'd4', value: 28 },
  { id: 'd5', value: 30 },
  { id: 'd6', value: 24 },
  { id: 'd7', value: 34 },
  { id: 'd8', value: 27 },
  { id: 'd9', value: 33 },
  { id: 'd10', value: 29 },
  { id: 'd11', value: 57 },
  { id: 'd12', value: 35 },
  { id: 'd13', value: 44 },
]
