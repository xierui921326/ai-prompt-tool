use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptVariableDraft {
    pub id: String,
    pub label: String,
    pub value: String,
    pub group: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptDraft {
    pub id: String,
    pub title: String,
    pub folder_id: String,
    pub version: String,
    pub content: String,
    pub variables: Vec<PromptVariableDraft>,
    pub updated_at: String,
}

fn prompt_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;

    fs::create_dir_all(&app_data_dir).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    Ok(app_data_dir.join("prompt-drafts.json"))
}

#[tauri::command]
fn load_prompt_draft(app: AppHandle) -> Result<Option<PromptDraft>, String> {
    let store_path = prompt_store_path(&app)?;

    if !store_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&store_path).map_err(|error| format!("无法读取 Prompt 草稿：{error}"))?;
    let draft = serde_json::from_str::<PromptDraft>(&content).map_err(|error| format!("Prompt 草稿格式无效：{error}"))?;

    Ok(Some(draft))
}

#[tauri::command]
fn save_prompt_draft(app: AppHandle, draft: PromptDraft) -> Result<PromptDraft, String> {
    if draft.id.trim().is_empty() {
        return Err("Prompt ID 不能为空".to_string());
    }

    if draft.title.trim().is_empty() {
        return Err("Prompt 标题不能为空".to_string());
    }

    if draft.content.trim().is_empty() {
        return Err("Prompt 内容不能为空".to_string());
    }

    let store_path = prompt_store_path(&app)?;
    let content = serde_json::to_string_pretty(&draft).map_err(|error| format!("无法序列化 Prompt 草稿：{error}"))?;

    fs::write(&store_path, content).map_err(|error| format!("无法保存 Prompt 草稿：{error}"))?;
    Ok(draft)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_prompt_draft, save_prompt_draft])
        .run(tauri::generate_context!())
        .expect("error while running PromptCraft application");
}
