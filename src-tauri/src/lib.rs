mod langfuse;

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

const WORKSPACE_FILE: &str = "promptcraft-workspace.json";
const LEGACY_DRAFT_FILE: &str = "prompt-drafts.json";
const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptVariableRecord {
    pub id: String,
    pub label: String,
    pub value: String,
    pub group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptVersionRecord {
    pub id: String,
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub branch: bool,
    pub content: String,
    pub variables: Vec<PromptVariableRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRecord {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub category: String,
    pub content: String,
    pub variables: Vec<PromptVariableRecord>,
    pub active_version_id: String,
    pub versions: Vec<PromptVersionRecord>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    pub prompt: PromptRecord,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub schema_version: u32,
    #[serde(default)]
    pub active_prompt_id: Option<String>,
    pub folders: Vec<FolderRecord>,
    pub prompts: Vec<PromptRecord>,
    #[serde(default)]
    pub trash: Vec<TrashEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePromptInput {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub variables: Option<Vec<PromptVariableRecord>>,
    pub version_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePromptInput {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub variables: Option<Vec<PromptVariableRecord>>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitVersionInput {
    pub prompt_id: String,
    pub version_id: String,
    pub title: String,
    pub date: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub branch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutVersionInput {
    pub prompt_id: String,
    pub version_id: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePromptInput {
    pub id: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderInput {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDraft {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub version: String,
    pub content: String,
    pub variables: Vec<PromptVariableRecord>,
    pub updated_at: String,
}

pub struct WorkspaceStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl WorkspaceStore {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    fn read(&self) -> Result<Workspace, String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        if !self.path.exists() {
            let workspace = seed_workspace();
            write_atomic(&self.path, &workspace)?;
            return Ok(workspace);
        }

        let content = fs::read_to_string(&self.path)
            .map_err(|error| format!("无法读取工作区文件：{error}"))?;
        let workspace: Workspace = serde_json::from_str(&content)
            .map_err(|error| format!("工作区文件格式无效：{error}"))?;
        Ok(workspace)
    }

    fn write(&self, workspace: &Workspace) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        write_atomic(&self.path, workspace)
    }

    fn mutate<F>(&self, mutate: F) -> Result<Workspace, String>
    where
        F: FnOnce(&mut Workspace) -> Result<(), String>,
    {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        let mut workspace = if self.path.exists() {
            let content = fs::read_to_string(&self.path)
                .map_err(|error| format!("无法读取工作区文件：{error}"))?;
            serde_json::from_str::<Workspace>(&content)
                .map_err(|error| format!("工作区文件格式无效：{error}"))?
        } else {
            seed_workspace()
        };

        mutate(&mut workspace)?;
        write_atomic(&self.path, &workspace)?;
        Ok(workspace)
    }
}

fn write_atomic(path: &Path, workspace: &Workspace) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    }
    let serialized = serde_json::to_string_pretty(workspace)
        .map_err(|error| format!("无法序列化工作区：{error}"))?;
    let temp_path = path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&temp_path)
            .map_err(|error| format!("无法写入临时工作区文件：{error}"))?;
        file.write_all(serialized.as_bytes())
            .map_err(|error| format!("无法写入临时工作区文件：{error}"))?;
        file.sync_all()
            .map_err(|error| format!("无法刷新临时工作区文件：{error}"))?;
    }
    fs::rename(&temp_path, path)
        .map_err(|error| format!("无法提交工作区文件：{error}"))?;
    Ok(())
}

fn workspace_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
    fs::create_dir_all(&app_data_dir).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    Ok(app_data_dir.join(WORKSPACE_FILE))
}

fn legacy_draft_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
    fs::create_dir_all(&app_data_dir).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    Ok(app_data_dir.join(LEGACY_DRAFT_FILE))
}

fn seed_workspace() -> Workspace {
    let now = "2024-05-22T20:16:00+08:00".to_string();
    let demo_prompt_id = "urban-night-drone".to_string();
    let variables = vec![
        PromptVariableRecord {
            id: "city".into(),
            label: "城市".into(),
            value: "上海".into(),
            group: "场景".into(),
        },
        PromptVariableRecord {
            id: "style".into(),
            label: "风格".into(),
            value: "电影感".into(),
            group: "视觉".into(),
        },
        PromptVariableRecord {
            id: "lens".into(),
            label: "镜头类型".into(),
            value: "无人机推轨".into(),
            group: "镜头".into(),
        },
        PromptVariableRecord {
            id: "mood".into(),
            label: "氛围".into(),
            value: "现代、冷静、大气".into(),
            group: "情绪".into(),
        },
        PromptVariableRecord {
            id: "landmark".into(),
            label: "地标建筑".into(),
            value: "陆家嘴天际线".into(),
            group: "场景".into(),
        },
        PromptVariableRecord {
            id: "motion".into(),
            label: "动态虚化".into(),
            value: "车流拖影".into(),
            group: "运动".into(),
        },
        PromptVariableRecord {
            id: "tone".into(),
            label: "色调".into(),
            value: "蓝黑与金色高光".into(),
            group: "视觉".into(),
        },
        PromptVariableRecord {
            id: "resolution".into(),
            label: "分辨率".into(),
            value: "4K".into(),
            group: "参数".into(),
        },
        PromptVariableRecord {
            id: "duration".into(),
            label: "时长".into(),
            value: "8秒".into(),
            group: "参数".into(),
        },
    ];

    let content = "请生成一段{{城市}}夜景的航拍视频，风格为{{风格}}，镜头语言使用{{镜头类型}}，强调{{氛围}}，画面中包含{{地标建筑}}，使用{{动态虚化}}效果，整体色调为{{色调}}，分辨率{{分辨率}}，时长{{时长}}。".to_string();

    let history = vec![
        PromptVersionRecord {
            id: "v1.0".into(),
            title: "初始版本".into(),
            date: "2024-05-20T10:00:00+08:00".into(),
            parent_id: None,
            branch: false,
            content: content.clone(),
            variables: variables.clone(),
        },
        PromptVersionRecord {
            id: "v2.0".into(),
            title: "调整镜头语言".into(),
            date: "2024-05-21T11:10:00+08:00".into(),
            parent_id: Some("v1.0".into()),
            branch: false,
            content: content.clone(),
            variables: variables.clone(),
        },
        PromptVersionRecord {
            id: "v2.1".into(),
            title: "增加动态虚化".into(),
            date: "2024-05-21T14:20:00+08:00".into(),
            parent_id: Some("v2.0".into()),
            branch: true,
            content: content.clone(),
            variables: variables.clone(),
        },
        PromptVersionRecord {
            id: "v2.2".into(),
            title: "调整色调".into(),
            date: "2024-05-21T16:50:00+08:00".into(),
            parent_id: Some("v2.0".into()),
            branch: true,
            content: content.clone(),
            variables: variables.clone(),
        },
        PromptVersionRecord {
            id: "v3.0".into(),
            title: "优化整体描述".into(),
            date: "2024-05-22T09:30:00+08:00".into(),
            parent_id: Some("v2.0".into()),
            branch: false,
            content: content.clone(),
            variables: variables.clone(),
        },
        PromptVersionRecord {
            id: "v3.2".into(),
            title: "当前版本".into(),
            date: now.clone(),
            parent_id: Some("v3.0".into()),
            branch: false,
            content: content.clone(),
            variables: variables.clone(),
        },
    ];

    let demo_prompt = PromptRecord {
        id: demo_prompt_id.clone(),
        title: "无人机航拍电影感的城市夜景".into(),
        folder_id: "photo".into(),
        category: "摄影".into(),
        content,
        variables,
        active_version_id: "v3.2".into(),
        versions: history,
        created_at: "2024-05-20T09:30:00+08:00".into(),
        updated_at: now,
    };

    Workspace {
        schema_version: SCHEMA_VERSION,
        active_prompt_id: Some(demo_prompt_id),
        folders: vec![
            FolderRecord {
                id: "all".into(),
                name: "全部 Prompt".into(),
                system: true,
            },
            FolderRecord {
                id: "photo".into(),
                name: "摄影".into(),
                system: false,
            },
            FolderRecord {
                id: "product".into(),
                name: "产品设计".into(),
                system: false,
            },
            FolderRecord {
                id: "copy".into(),
                name: "文案写作".into(),
                system: false,
            },
            FolderRecord {
                id: "agent".into(),
                name: "智能体项目".into(),
                system: false,
            },
            FolderRecord {
                id: "other".into(),
                name: "其他".into(),
                system: false,
            },
        ],
        prompts: vec![demo_prompt],
        trash: vec![],
    }
}

fn validate_non_empty(value: &str, field: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field} 不能为空"));
    }
    Ok(())
}

#[tauri::command]
fn load_workspace(store: State<'_, WorkspaceStore>) -> Result<Workspace, String> {
    store.read()
}

#[tauri::command]
fn save_workspace(
    store: State<'_, WorkspaceStore>,
    workspace: Workspace,
) -> Result<Workspace, String> {
    if workspace.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "工作区版本不一致：期望 {SCHEMA_VERSION}，实际 {}",
            workspace.schema_version
        ));
    }
    store.write(&workspace)?;
    Ok(workspace)
}

#[tauri::command]
fn create_prompt(
    store: State<'_, WorkspaceStore>,
    input: CreatePromptInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.id, "Prompt ID")?;
    validate_non_empty(&input.title, "Prompt 标题")?;
    validate_non_empty(&input.folder_id, "Prompt 所属文件夹")?;
    validate_non_empty(&input.version_id, "Prompt 版本号")?;

    store.mutate(|workspace| {
        if workspace.prompts.iter().any(|item| item.id == input.id) {
            return Err(format!("Prompt ID 已存在：{}", input.id));
        }
        if workspace.trash.iter().any(|entry| entry.prompt.id == input.id) {
            return Err(format!("Prompt ID 在回收站中已存在：{}", input.id));
        }
        if !workspace.folders.iter().any(|folder| folder.id == input.folder_id) {
            return Err(format!("文件夹不存在：{}", input.folder_id));
        }

        let variables = input.variables.unwrap_or_default();
        let content = input.content.unwrap_or_default();
        let category = input.category.unwrap_or_else(|| "未分类".to_string());

        let initial_version = PromptVersionRecord {
            id: input.version_id.clone(),
            title: "初始版本".into(),
            date: input.created_at.clone(),
            parent_id: None,
            branch: false,
            content: content.clone(),
            variables: variables.clone(),
        };

        let prompt = PromptRecord {
            id: input.id.clone(),
            title: input.title,
            folder_id: input.folder_id,
            category,
            content,
            variables,
            active_version_id: input.version_id,
            versions: vec![initial_version],
            created_at: input.created_at.clone(),
            updated_at: input.created_at,
        };

        workspace.prompts.push(prompt);
        workspace.active_prompt_id = Some(input.id);
        Ok(())
    })
}

#[tauri::command]
fn update_prompt(
    store: State<'_, WorkspaceStore>,
    input: UpdatePromptInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.id, "Prompt ID")?;

    store.mutate(|workspace| {
        let folders_snapshot = workspace.folders.clone();
        let prompt = workspace
            .prompts
            .iter_mut()
            .find(|item| item.id == input.id)
            .ok_or_else(|| format!("找不到 Prompt：{}", input.id))?;

        if let Some(title) = input.title {
            validate_non_empty(&title, "Prompt 标题")?;
            prompt.title = title;
        }
        if let Some(folder_id) = input.folder_id {
            validate_non_empty(&folder_id, "Prompt 所属文件夹")?;
            if !folders_snapshot.iter().any(|folder| folder.id == folder_id) {
                return Err(format!("文件夹不存在：{folder_id}"));
            }
            prompt.folder_id = folder_id;
        }
        if let Some(category) = input.category {
            prompt.category = category;
        }
        if let Some(content) = input.content {
            prompt.content = content;
        }
        if let Some(variables) = input.variables {
            prompt.variables = variables;
        }
        prompt.updated_at = input.updated_at;
        Ok(())
    })
}

#[tauri::command]
fn delete_prompt(
    store: State<'_, WorkspaceStore>,
    input: DeletePromptInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.id, "Prompt ID")?;

    store.mutate(|workspace| {
        let index = workspace
            .prompts
            .iter()
            .position(|item| item.id == input.id)
            .ok_or_else(|| format!("找不到 Prompt：{}", input.id))?;
        let prompt = workspace.prompts.remove(index);
        workspace.trash.push(TrashEntry {
            prompt,
            deleted_at: input.deleted_at,
        });
        if workspace.active_prompt_id.as_deref() == Some(input.id.as_str()) {
            workspace.active_prompt_id = workspace.prompts.first().map(|item| item.id.clone());
        }
        Ok(())
    })
}

#[tauri::command]
fn restore_prompt(
    store: State<'_, WorkspaceStore>,
    id: String,
    updated_at: String,
) -> Result<Workspace, String> {
    validate_non_empty(&id, "Prompt ID")?;

    store.mutate(|workspace| {
        let folders_snapshot = workspace.folders.clone();
        let index = workspace
            .trash
            .iter()
            .position(|entry| entry.prompt.id == id)
            .ok_or_else(|| format!("回收站中找不到 Prompt：{id}"))?;
        let entry = workspace.trash.remove(index);
        let mut prompt = entry.prompt;
        if !folders_snapshot.iter().any(|folder| folder.id == prompt.folder_id) {
            prompt.folder_id = folders_snapshot
                .iter()
                .find(|folder| !folder.system)
                .map(|folder| folder.id.clone())
                .unwrap_or_else(|| "all".to_string());
        }
        prompt.updated_at = updated_at;
        workspace.active_prompt_id = Some(prompt.id.clone());
        workspace.prompts.push(prompt);
        Ok(())
    })
}

#[tauri::command]
fn purge_prompt(
    store: State<'_, WorkspaceStore>,
    id: String,
) -> Result<Workspace, String> {
    validate_non_empty(&id, "Prompt ID")?;

    store.mutate(|workspace| {
        let index = workspace
            .trash
            .iter()
            .position(|entry| entry.prompt.id == id)
            .ok_or_else(|| format!("回收站中找不到 Prompt：{id}"))?;
        workspace.trash.remove(index);
        Ok(())
    })
}

#[tauri::command]
fn commit_prompt_version(
    store: State<'_, WorkspaceStore>,
    input: CommitVersionInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.prompt_id, "Prompt ID")?;
    validate_non_empty(&input.version_id, "版本号")?;
    validate_non_empty(&input.title, "版本标题")?;

    store.mutate(|workspace| {
        let prompt = workspace
            .prompts
            .iter_mut()
            .find(|item| item.id == input.prompt_id)
            .ok_or_else(|| format!("找不到 Prompt：{}", input.prompt_id))?;

        if prompt.versions.iter().any(|version| version.id == input.version_id) {
            return Err(format!("版本号已存在：{}", input.version_id));
        }

        let snapshot = PromptVersionRecord {
            id: input.version_id.clone(),
            title: input.title,
            date: input.date.clone(),
            parent_id: input
                .parent_id
                .or_else(|| Some(prompt.active_version_id.clone())),
            branch: input.branch,
            content: prompt.content.clone(),
            variables: prompt.variables.clone(),
        };
        prompt.versions.push(snapshot);
        prompt.active_version_id = input.version_id;
        prompt.updated_at = input.date;
        Ok(())
    })
}

#[tauri::command]
fn checkout_prompt_version(
    store: State<'_, WorkspaceStore>,
    input: CheckoutVersionInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.prompt_id, "Prompt ID")?;
    validate_non_empty(&input.version_id, "版本号")?;

    store.mutate(|workspace| {
        let prompt = workspace
            .prompts
            .iter_mut()
            .find(|item| item.id == input.prompt_id)
            .ok_or_else(|| format!("找不到 Prompt：{}", input.prompt_id))?;
        let version = prompt
            .versions
            .iter()
            .find(|version| version.id == input.version_id)
            .ok_or_else(|| format!("找不到版本：{}", input.version_id))?
            .clone();

        prompt.content = version.content;
        prompt.variables = version.variables;
        prompt.active_version_id = version.id;
        prompt.updated_at = input.updated_at;
        Ok(())
    })
}

#[tauri::command]
fn create_folder(
    store: State<'_, WorkspaceStore>,
    input: CreateFolderInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.id, "文件夹 ID")?;
    validate_non_empty(&input.name, "文件夹名称")?;

    store.mutate(|workspace| {
        if workspace.folders.iter().any(|folder| folder.id == input.id) {
            return Err(format!("文件夹 ID 已存在：{}", input.id));
        }
        workspace.folders.push(FolderRecord {
            id: input.id,
            name: input.name,
            system: false,
        });
        Ok(())
    })
}

#[tauri::command]
fn rename_folder(
    store: State<'_, WorkspaceStore>,
    input: RenameFolderInput,
) -> Result<Workspace, String> {
    validate_non_empty(&input.id, "文件夹 ID")?;
    validate_non_empty(&input.name, "文件夹名称")?;

    store.mutate(|workspace| {
        let folder = workspace
            .folders
            .iter_mut()
            .find(|folder| folder.id == input.id)
            .ok_or_else(|| format!("找不到文件夹：{}", input.id))?;
        if folder.system {
            return Err("系统文件夹无法重命名".to_string());
        }
        folder.name = input.name;
        Ok(())
    })
}

#[tauri::command]
fn delete_folder(
    store: State<'_, WorkspaceStore>,
    id: String,
) -> Result<Workspace, String> {
    validate_non_empty(&id, "文件夹 ID")?;

    store.mutate(|workspace| {
        let index = workspace
            .folders
            .iter()
            .position(|folder| folder.id == id)
            .ok_or_else(|| format!("找不到文件夹：{id}"))?;
        if workspace.folders[index].system {
            return Err("系统文件夹无法删除".to_string());
        }
        let fallback = workspace
            .folders
            .iter()
            .find(|folder| folder.id != id && !folder.system)
            .map(|folder| folder.id.clone())
            .unwrap_or_else(|| "all".to_string());
        for prompt in workspace.prompts.iter_mut() {
            if prompt.folder_id == id {
                prompt.folder_id = fallback.clone();
            }
        }
        for entry in workspace.trash.iter_mut() {
            if entry.prompt.folder_id == id {
                entry.prompt.folder_id = fallback.clone();
            }
        }
        workspace.folders.remove(index);
        Ok(())
    })
}

#[tauri::command]
fn set_active_prompt(
    store: State<'_, WorkspaceStore>,
    id: Option<String>,
) -> Result<Workspace, String> {
    store.mutate(|workspace| {
        if let Some(ref new_id) = id {
            if !workspace.prompts.iter().any(|item| item.id == *new_id) {
                return Err(format!("找不到 Prompt：{new_id}"));
            }
        }
        workspace.active_prompt_id = id;
        Ok(())
    })
}

#[tauri::command]
fn load_prompt_draft(store: State<'_, WorkspaceStore>) -> Result<Option<PromptDraft>, String> {
    let workspace = store.read()?;
    let active_id = match workspace.active_prompt_id {
        Some(id) => id,
        None => return Ok(None),
    };

    let prompt = match workspace.prompts.iter().find(|item| item.id == active_id) {
        Some(prompt) => prompt,
        None => return Ok(None),
    };

    Ok(Some(PromptDraft {
        id: prompt.id.clone(),
        title: prompt.title.clone(),
        folder_id: prompt.folder_id.clone(),
        version: prompt.active_version_id.clone(),
        content: prompt.content.clone(),
        variables: prompt.variables.clone(),
        updated_at: prompt.updated_at.clone(),
    }))
}

#[tauri::command]
fn save_prompt_draft(
    store: State<'_, WorkspaceStore>,
    draft: PromptDraft,
) -> Result<PromptDraft, String> {
    validate_non_empty(&draft.id, "Prompt ID")?;
    validate_non_empty(&draft.title, "Prompt 标题")?;
    validate_non_empty(&draft.content, "Prompt 内容")?;

    let input = UpdatePromptInput {
        id: draft.id.clone(),
        title: Some(draft.title.clone()),
        folder_id: Some(draft.folder_id.clone()),
        category: None,
        content: Some(draft.content.clone()),
        variables: Some(draft.variables.clone()),
        updated_at: draft.updated_at.clone(),
    };
    update_prompt(store, input)?;
    Ok(draft)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let store_path = workspace_store_path(&app.handle())?;
            migrate_legacy_draft(&app.handle(), &store_path)?;
            app.manage(WorkspaceStore::new(store_path));
            let langfuse_store = langfuse::init(&app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            app.manage(langfuse_store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            create_prompt,
            update_prompt,
            delete_prompt,
            restore_prompt,
            purge_prompt,
            commit_prompt_version,
            checkout_prompt_version,
            create_folder,
            rename_folder,
            delete_folder,
            set_active_prompt,
            load_prompt_draft,
            save_prompt_draft,
            langfuse::load_langfuse_settings,
            langfuse::save_langfuse_settings,
            langfuse::clear_langfuse_settings,
            langfuse::test_langfuse_connection,
            langfuse::list_langfuse_prompts,
            langfuse::fetch_langfuse_prompt,
            langfuse::list_langfuse_datasets,
            langfuse::fetch_langfuse_dataset_items,
            langfuse::record_langfuse_event,
            langfuse::load_langfuse_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running PromptCraft application");
}

fn migrate_legacy_draft(app: &AppHandle, store_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if store_path.exists() {
        return Ok(());
    }
    let legacy_path = legacy_draft_path(app).map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
    if !legacy_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&legacy_path)?;
    let draft: PromptDraft = match serde_json::from_str(&content) {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };

    let mut workspace = seed_workspace();
    if let Some(prompt) = workspace.prompts.iter_mut().find(|item| item.id == draft.id) {
        prompt.title = draft.title;
        prompt.folder_id = draft.folder_id;
        prompt.content = draft.content;
        prompt.variables = draft.variables;
        prompt.updated_at = draft.updated_at;
        if !prompt
            .versions
            .iter()
            .any(|version| version.id == draft.version)
        {
            let snapshot = PromptVersionRecord {
                id: draft.version.clone(),
                title: "迁移自旧草稿".into(),
                date: prompt.updated_at.clone(),
                parent_id: Some(prompt.active_version_id.clone()),
                branch: false,
                content: prompt.content.clone(),
                variables: prompt.variables.clone(),
            };
            prompt.versions.push(snapshot);
        }
        prompt.active_version_id = draft.version;
    }
    workspace.active_prompt_id = Some(draft.id);
    write_atomic(store_path, &workspace).map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
    Ok(())
}
