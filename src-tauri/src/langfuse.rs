use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use base64::Engine;
use chrono::Utc;
use reqwest::{header::HeaderMap, Client};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const SETTINGS_FILE: &str = "langfuse-config.json";
const CACHE_FILE: &str = "langfuse-cache.json";
const DEFAULT_HOST: &str = "https://cloud.langfuse.com";
const REQUEST_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LangfuseSettings {
    pub host: String,
    pub public_key: String,
    #[serde(default)]
    pub secret_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PublicLangfuseSettings {
    pub host: String,
    pub public_key: String,
    pub has_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub ok: bool,
    pub message: String,
    pub host: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePromptSummary {
    pub name: String,
    #[serde(default)]
    pub versions: Vec<u32>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub last_updated_at: Option<String>,
    #[serde(default)]
    pub last_config: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePrompt {
    pub name: String,
    pub version: u32,
    #[serde(default)]
    pub prompt_type: Option<String>,
    pub body: String,
    #[serde(default)]
    pub config: Option<serde_json::Value>,
    #[serde(default)]
    pub labels: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDataset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub items_count: Option<u32>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDatasetItem {
    pub id: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub input: serde_json::Value,
    #[serde(default)]
    pub expected_output: serde_json::Value,
    #[serde(default)]
    pub metadata: serde_json::Value,
    #[serde(default)]
    pub source_trace_id: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LangfuseCache {
    #[serde(default)]
    pub fetched_at: Option<String>,
    #[serde(default)]
    pub prompts: Vec<RemotePromptSummary>,
    #[serde(default)]
    pub datasets: Vec<RemoteDataset>,
    #[serde(default)]
    pub dataset_items: std::collections::BTreeMap<String, Vec<RemoteDatasetItem>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordEventInput {
    pub event_type: String,
    pub prompt_id: String,
    #[serde(default)]
    pub prompt_title: Option<String>,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

pub struct LangfuseStore {
    settings_path: PathBuf,
    cache_path: PathBuf,
    lock: Mutex<()>,
}

impl LangfuseStore {
    fn new(settings_path: PathBuf, cache_path: PathBuf) -> Self {
        Self {
            settings_path,
            cache_path,
            lock: Mutex::new(()),
        }
    }

    fn read_settings(&self) -> Result<Option<LangfuseSettings>, String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        if !self.settings_path.exists() {
            return Ok(None);
        }
        let raw = fs::read_to_string(&self.settings_path)
            .map_err(|error| format!("无法读取 Langfuse 配置：{error}"))?;
        if raw.trim().is_empty() {
            return Ok(None);
        }
        let parsed: LangfuseSettings = serde_json::from_str(&raw)
            .map_err(|error| format!("Langfuse 配置格式无效：{error}"))?;
        Ok(Some(parsed))
    }

    fn write_settings(&self, settings: &LangfuseSettings) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        if let Some(parent) = self.settings_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建配置目录：{error}"))?;
        }
        let serialized = serde_json::to_string_pretty(settings)
            .map_err(|error| format!("无法序列化 Langfuse 配置：{error}"))?;
        fs::write(&self.settings_path, serialized)
            .map_err(|error| format!("无法写入 Langfuse 配置：{error}"))?;
        restrict_permissions(&self.settings_path);
        Ok(())
    }

    fn clear_settings(&self) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        if self.settings_path.exists() {
            fs::remove_file(&self.settings_path)
                .map_err(|error| format!("无法删除 Langfuse 配置：{error}"))?;
        }
        if self.cache_path.exists() {
            fs::remove_file(&self.cache_path)
                .map_err(|error| format!("无法删除 Langfuse 缓存：{error}"))?;
        }
        Ok(())
    }

    fn read_cache(&self) -> Result<LangfuseCache, String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        if !self.cache_path.exists() {
            return Ok(LangfuseCache::default());
        }
        let raw = fs::read_to_string(&self.cache_path)
            .map_err(|error| format!("无法读取 Langfuse 缓存：{error}"))?;
        if raw.trim().is_empty() {
            return Ok(LangfuseCache::default());
        }
        let parsed: LangfuseCache = serde_json::from_str(&raw)
            .map_err(|error| format!("Langfuse 缓存格式无效：{error}"))?;
        Ok(parsed)
    }

    fn write_cache(&self, cache: &LangfuseCache) -> Result<(), String> {
        let _guard = self.lock.lock().map_err(|error| error.to_string())?;
        if let Some(parent) = self.cache_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建缓存目录：{error}"))?;
        }
        let serialized = serde_json::to_string_pretty(cache)
            .map_err(|error| format!("无法序列化 Langfuse 缓存：{error}"))?;
        fs::write(&self.cache_path, serialized)
            .map_err(|error| format!("无法写入 Langfuse 缓存：{error}"))?;
        Ok(())
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = fs::metadata(path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o600);
        let _ = fs::set_permissions(path, perms);
    }
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) {}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录：{error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    Ok(dir.join(CACHE_FILE))
}

pub fn init(app: &AppHandle) -> Result<LangfuseStore, String> {
    Ok(LangfuseStore::new(settings_path(app)?, cache_path(app)?))
}

fn normalize_host(input: &str) -> String {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        DEFAULT_HOST.to_string()
    } else {
        trimmed.to_string()
    }
}

fn require_settings(store: &LangfuseStore) -> Result<LangfuseSettings, String> {
    let settings = store
        .read_settings()?
        .ok_or_else(|| "尚未配置 Langfuse 凭据，请先在设置中填写".to_string())?;
    if settings.public_key.trim().is_empty() || settings.secret_key.trim().is_empty() {
        return Err("Langfuse 凭据为空，请重新填写".to_string());
    }
    Ok(settings)
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent("PromptCraft/0.1")
        .build()
        .map_err(|error| format!("无法初始化 HTTP 客户端：{error}"))
}

fn build_auth_header(settings: &LangfuseSettings) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    let token = base64::engine::general_purpose::STANDARD.encode(format!(
        "{}:{}",
        settings.public_key, settings.secret_key
    ));
    let value = format!("Basic {token}")
        .parse()
        .map_err(|error| format!("无法生成认证头：{error}"))?;
    headers.insert(reqwest::header::AUTHORIZATION, value);
    Ok(headers)
}

async fn request_json<T: serde::de::DeserializeOwned>(
    settings: &LangfuseSettings,
    method: reqwest::Method,
    path: &str,
    query: Option<&[(&str, String)]>,
    body: Option<serde_json::Value>,
) -> Result<T, String> {
    let host = normalize_host(&settings.host);
    let url = format!("{host}{path}");
    let client = build_client()?;
    let mut request = client.request(method, &url).headers(build_auth_header(settings)?);
    if let Some(query_pairs) = query {
        request = request.query(query_pairs);
    }
    if let Some(payload) = body {
        request = request.json(&payload);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("请求 Langfuse 失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Langfuse 返回错误 {status}：{}",
            body.chars().take(256).collect::<String>()
        ));
    }
    response
        .json::<T>()
        .await
        .map_err(|error| format!("解析 Langfuse 响应失败：{error}"))
}

#[derive(Debug, Deserialize)]
struct PromptsListResponse {
    data: Vec<RemotePromptSummary>,
}

#[derive(Debug, Deserialize)]
struct DatasetsListResponse {
    data: Vec<RemoteDataset>,
}

#[derive(Debug, Deserialize)]
struct DatasetItemsResponse {
    data: Vec<RemoteDatasetItem>,
}

#[tauri::command]
pub async fn load_langfuse_settings(
    store: State<'_, LangfuseStore>,
) -> Result<Option<PublicLangfuseSettings>, String> {
    let settings = store.read_settings()?;
    Ok(settings.map(|value| PublicLangfuseSettings {
        host: if value.host.is_empty() {
            DEFAULT_HOST.to_string()
        } else {
            value.host
        },
        public_key: value.public_key,
        has_secret: !value.secret_key.trim().is_empty(),
    }))
}

#[tauri::command]
pub async fn save_langfuse_settings(
    store: State<'_, LangfuseStore>,
    input: LangfuseSettings,
) -> Result<PublicLangfuseSettings, String> {
    let mut next = input;
    if next.host.trim().is_empty() {
        next.host = DEFAULT_HOST.to_string();
    } else {
        next.host = normalize_host(&next.host);
    }
    next.public_key = next.public_key.trim().to_string();
    next.secret_key = next.secret_key.trim().to_string();

    if next.public_key.is_empty() {
        return Err("Public Key 不能为空".into());
    }
    if next.secret_key.is_empty() {
        return Err("Secret Key 不能为空".into());
    }
    store.write_settings(&next)?;
    Ok(PublicLangfuseSettings {
        host: next.host,
        public_key: next.public_key,
        has_secret: true,
    })
}

#[tauri::command]
pub async fn clear_langfuse_settings(
    store: State<'_, LangfuseStore>,
) -> Result<(), String> {
    store.clear_settings()
}

#[tauri::command]
pub async fn test_langfuse_connection(
    store: State<'_, LangfuseStore>,
) -> Result<ConnectionStatus, String> {
    let settings = require_settings(&store)?;
    let result: Result<PromptsListResponse, String> = request_json(
        &settings,
        reqwest::Method::GET,
        "/api/public/v2/prompts",
        Some(&[("limit", "1".to_string())]),
        None,
    )
    .await;

    let host = normalize_host(&settings.host);
    match result {
        Ok(_) => Ok(ConnectionStatus {
            ok: true,
            message: "连接成功".into(),
            host,
        }),
        Err(message) => Ok(ConnectionStatus {
            ok: false,
            message,
            host,
        }),
    }
}

#[tauri::command]
pub async fn list_langfuse_prompts(
    store: State<'_, LangfuseStore>,
    limit: Option<u32>,
) -> Result<Vec<RemotePromptSummary>, String> {
    let settings = require_settings(&store)?;
    let limit_value = limit.unwrap_or(50).clamp(1, 100);
    let response: PromptsListResponse = request_json(
        &settings,
        reqwest::Method::GET,
        "/api/public/v2/prompts",
        Some(&[("limit", limit_value.to_string())]),
        None,
    )
    .await?;

    let mut cache = store.read_cache().unwrap_or_default();
    cache.prompts = response.data.clone();
    cache.fetched_at = Some(Utc::now().to_rfc3339());
    let _ = store.write_cache(&cache);

    Ok(response.data)
}

#[tauri::command]
pub async fn fetch_langfuse_prompt(
    store: State<'_, LangfuseStore>,
    name: String,
    version: Option<u32>,
    label: Option<String>,
) -> Result<RemotePrompt, String> {
    let settings = require_settings(&store)?;
    if name.trim().is_empty() {
        return Err("Prompt 名称不能为空".into());
    }
    let mut query: Vec<(&str, String)> = Vec::new();
    if let Some(version_value) = version {
        query.push(("version", version_value.to_string()));
    } else if let Some(label_value) = label {
        if !label_value.trim().is_empty() {
            query.push(("label", label_value));
        }
    }
    let path = format!("/api/public/v2/prompts/{}", urlencoding_encode(&name));
    let response: serde_json::Value = request_json(
        &settings,
        reqwest::Method::GET,
        &path,
        if query.is_empty() { None } else { Some(&query) },
        None,
    )
    .await?;
    parse_remote_prompt(response)
}

#[tauri::command]
pub async fn list_langfuse_datasets(
    store: State<'_, LangfuseStore>,
) -> Result<Vec<RemoteDataset>, String> {
    let settings = require_settings(&store)?;
    let response: DatasetsListResponse = request_json(
        &settings,
        reqwest::Method::GET,
        "/api/public/datasets",
        Some(&[("limit", "100".to_string())]),
        None,
    )
    .await?;

    let mut cache = store.read_cache().unwrap_or_default();
    cache.datasets = response.data.clone();
    cache.fetched_at = Some(Utc::now().to_rfc3339());
    let _ = store.write_cache(&cache);

    Ok(response.data)
}

#[tauri::command]
pub async fn fetch_langfuse_dataset_items(
    store: State<'_, LangfuseStore>,
    name: String,
    limit: Option<u32>,
) -> Result<Vec<RemoteDatasetItem>, String> {
    let settings = require_settings(&store)?;
    if name.trim().is_empty() {
        return Err("数据集名称不能为空".into());
    }
    let limit_value = limit.unwrap_or(100).clamp(1, 200);
    let path = format!(
        "/api/public/datasets/{}/items",
        urlencoding_encode(&name)
    );
    let response: DatasetItemsResponse = request_json(
        &settings,
        reqwest::Method::GET,
        &path,
        Some(&[("limit", limit_value.to_string())]),
        None,
    )
    .await?;

    let mut cache = store.read_cache().unwrap_or_default();
    cache.dataset_items.insert(name, response.data.clone());
    cache.fetched_at = Some(Utc::now().to_rfc3339());
    let _ = store.write_cache(&cache);

    Ok(response.data)
}

#[tauri::command]
pub async fn record_langfuse_event(
    store: State<'_, LangfuseStore>,
    input: RecordEventInput,
) -> Result<(), String> {
    let settings = match store.read_settings()? {
        Some(value) if !value.public_key.is_empty() && !value.secret_key.is_empty() => value,
        _ => return Ok(()),
    };

    let now = Utc::now().to_rfc3339();
    let trace_id = Uuid::new_v4().to_string();
    let observation_id = Uuid::new_v4().to_string();

    let mut metadata = serde_json::Map::new();
    metadata.insert(
        "promptId".into(),
        serde_json::Value::String(input.prompt_id.clone()),
    );
    if let Some(title) = &input.prompt_title {
        metadata.insert(
            "promptTitle".into(),
            serde_json::Value::String(title.clone()),
        );
    }
    if let Some(extra) = input.metadata.clone() {
        if let serde_json::Value::Object(map) = extra {
            for (key, value) in map {
                metadata.insert(key, value);
            }
        }
    }

    let body = serde_json::json!({
        "batch": [
            {
                "id": Uuid::new_v4().to_string(),
                "type": "trace-create",
                "timestamp": now,
                "body": {
                    "id": trace_id,
                    "name": format!("promptcraft.{}", input.event_type),
                    "metadata": metadata,
                    "tags": ["promptcraft"]
                }
            },
            {
                "id": Uuid::new_v4().to_string(),
                "type": "event-create",
                "timestamp": now,
                "body": {
                    "id": observation_id,
                    "traceId": trace_id,
                    "name": input.event_type,
                    "metadata": metadata,
                    "startTime": now
                }
            }
        ]
    });

    let result: Result<serde_json::Value, String> = request_json(
        &settings,
        reqwest::Method::POST,
        "/api/public/ingestion",
        None,
        Some(body),
    )
    .await;
    if let Err(error) = result {
        eprintln!("[langfuse] record_event failed: {error}");
    }
    Ok(())
}

#[tauri::command]
pub async fn load_langfuse_cache(
    store: State<'_, LangfuseStore>,
) -> Result<LangfuseCache, String> {
    store.read_cache()
}

fn parse_remote_prompt(value: serde_json::Value) -> Result<RemotePrompt, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "Langfuse Prompt 响应格式无效".to_string())?;
    let name = object
        .get("name")
        .and_then(|item| item.as_str())
        .ok_or_else(|| "缺少 Prompt 名称".to_string())?
        .to_string();
    let version = object
        .get("version")
        .and_then(|item| item.as_u64())
        .ok_or_else(|| "缺少 Prompt 版本".to_string())? as u32;
    let prompt_type = object
        .get("type")
        .and_then(|item| item.as_str())
        .map(|item| item.to_string());
    let body = match object.get("prompt") {
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(other) => serde_json::to_string_pretty(other)
            .map_err(|error| format!("无法序列化 Prompt 内容：{error}"))?,
        None => String::new(),
    };
    let config = object.get("config").cloned();
    let labels = object
        .get("labels")
        .and_then(|item| item.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let tags = object
        .get("tags")
        .and_then(|item| item.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|entry| entry.as_str().map(|value| value.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let updated_at = object
        .get("updatedAt")
        .and_then(|item| item.as_str())
        .map(|value| value.to_string());

    Ok(RemotePrompt {
        name,
        version,
        prompt_type,
        body,
        config,
        labels,
        tags,
        updated_at,
    })
}

fn urlencoding_encode(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for byte in input.bytes() {
        let is_unreserved = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~');
        if is_unreserved {
            output.push(byte as char);
        } else {
            output.push_str(&format!("%{:02X}", byte));
        }
    }
    output
}
