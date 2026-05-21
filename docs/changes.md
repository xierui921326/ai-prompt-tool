# PromptCraft 变更记录

## 2026年5月15日

### 本次调整

1. 补充了 Tauri 2.0 项目初始化说明：
   - 第一版为了尽快交付参考图界面，采用了手工最小化搭建方式，而不是直接执行 `pnpm create tauri-app` 或 `cargo install create-tauri-app`。
   - 这样做的结果是前端骨架和 Tauri 最小配置是可运行的，但不属于官方脚手架生成流程。
   - 后续若你希望完全对齐官方工程模板，可以再执行一次脚手架重建或对比迁移。

2. 新增 `Makefile`：
   - 集中管理安装、开发、构建、类型检查、Tauri 开发与构建命令。
   - 默认使用 `pnpm`，更符合你提到的初始化习惯。

3. 新增 `docs` 目录：
   - 用于存放后续每次变更说明、架构调整记录、功能迭代文档。
   - 当前文件即为首次变更记录。

4. 已完成官方脚手架重建：
   - 通过 `pnpm create tauri-app@latest` 在新目录生成官方 Tauri 2.0 + React TypeScript 工程。
   - 再将官方脚手架内容回填到当前目录，避免当前目录非空导致初始化器中断。
   - 已把 PromptCraft 的页面、样式、数据层与 Langfuse 服务边界迁移回官方工程。

5. 修复 Rust 入口诊断问题：
   - `src-tauri/src/main.rs` 统一引用 `promptcraft_lib::run()`。
   - `src-tauri/Cargo.toml` 中 `[lib].name` 保持为 `promptcraft_lib`。
   - 执行 `cargo clean && cargo check` 后刷新 Cargo 元数据，IDE 中 `failed to resolve` 诊断已消失。

6. 清理脚手架残留：
   - 删除未使用的 `src/App.css`，当前界面样式统一由 `src/styles.css` 管理。
   - 检查确认迁移时使用的临时官方工程目录与备份目录已不存在。

7. 调整 Makefile 为 Tauri 2.0 一体化命令优先：
   - `make dev` 对应 `pnpm tauri dev`，用于启动桌面开发模式。
   - `make build` 对应 `pnpm tauri build`，用于构建桌面应用。
   - `make check` 统一执行前端类型检查与 Rust 检查。
   - 单独前端调试命令改为 `make web-dev`、`make web-build`，避免和 Tauri 主流程混淆。

8. 第一批修复一屏工作台布局：
   - 将根节点、页面主体与工作台统一约束为 `100dvh`，关闭页面级纵向滚动。
   - 压缩品牌区、左侧导航、主编辑区、AI 助手区和右侧洞察面板的间距与高度。
   - 使用固定工作台网格与内部内容裁切，保证桌面窗口中整体结构一屏展示。

9. 第二批补齐当前页面可见本地功能：
   - 主导航、文件夹、标签页、历史版本切换已改为真实状态切换。
   - Prompt 编辑器改为可编辑文本区域，支持新建 Prompt、导入内容、分享预览。
   - 变量页支持编辑变量值并把变量插入 Prompt。
   - 知识库术语支持搜索、分类过滤和插入到 Prompt。
   - AI 助手和 AI 生成 Plan 支持本地生成反馈，后续再接入 Tauri 后端与 Langfuse/LLM。

10. 第三批接入 Tauri 本地持久化：
   - 在 Tauri 后端新增 `load_prompt_draft` 与 `save_prompt_draft` 命令。
   - Prompt 草稿保存到应用数据目录中的 `prompt-drafts.json`，避免写入前端或仓库目录。
   - 后端保存命令增加 Prompt ID、标题、内容的基础校验。
   - 前端新增 `src/services/promptStorage.ts`，通过 Tauri `invoke` 加载/保存草稿。
   - 浏览器预览环境自动降级到 `localStorage`，便于单独调试前端。
   - 顶部操作区新增“保存”入口，应用启动时自动恢复已保存草稿。

11. 第三批·续：Tauri 工作区与多 Prompt CRUD：
   - 把后端持久化从单个草稿升级为完整工作区，数据落到 `promptcraft-workspace.json`，写入采用临时文件 + 原子 rename。
   - 工作区结构包含 `schemaVersion / activePromptId / folders / prompts / trash`，每个 Prompt 内嵌 `variables[]` 与 `versions[]` 快照。
   - 启动时若旧 `prompt-drafts.json` 存在会自动迁移到新工作区。
   - 新增 Tauri 命令：`load_workspace / save_workspace / create_prompt / update_prompt / delete_prompt / restore_prompt / purge_prompt / commit_prompt_version / checkout_prompt_version / create_folder / rename_folder / delete_folder / set_active_prompt`，旧的 `load_prompt_draft / save_prompt_draft` 改为基于当前激活 Prompt 的兼容入口。
   - 前端用新的 `src/services/workspaceStorage.ts` 替换原有 `promptStorage.ts`，浏览器环境保持 `localStorage` 回退，保留与后端一致的数据结构。
   - `App.tsx` 改造为多 Prompt 工作台：
     - 左侧增加 Prompt 列表，按当前文件夹筛选，可切换、删除（移入回收站）。
     - 文件夹可新建 / 删除（系统文件夹「全部 Prompt」受保护），删除后归属 Prompt 会自动迁移到回退文件夹。
     - 顶部「新建 Prompt」「保存」走新的后端命令，标题支持重命名。
     - 主导航「回收站」入口渲染回收站视图，可恢复或永久删除。
     - 「历史版本」标签页与右侧时间线均支持「提交当前为新版本」与「切回历史版本」，分别对应 `commit_prompt_version` / `checkout_prompt_version`。

### 当前常用命令

```bash
make install
make dev
make build
make check
make clean
```

### 单独调试命令

```bash
make typecheck
make rust-check
make web-dev
make web-build
make preview
```

### 本次验证

```bash
pnpm install
pnpm typecheck
pnpm build
cargo clean && cargo check
make help
make check
```

### 说明

当前仓库已切换到以 `pnpm` 为主的官方脚手架结构。Tauri 2.0 的主入口命令统一使用 `pnpm tauri ...`，Makefile 中的 `dev` 和 `build` 已对应桌面应用完整流程。后续新增功能、修复记录、架构调整说明统一继续写入 `docs` 目录。
