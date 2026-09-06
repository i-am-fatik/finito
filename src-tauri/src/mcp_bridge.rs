use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{oneshot, Semaphore};

pub const PORT: u16 = 41414;
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
pub const MAIN_WINDOW: &str = "main";
const MAX_IN_FLIGHT: usize = 8;
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(90);
const REQUEST_EVENT: &str = "mcp-http-request";

#[derive(Serialize, Clone)]
pub struct ForwardedRequest {
    pub id: u64,
    pub method: String,
    pub uri: String,
    pub headers: Vec<[String; 2]>,
    pub body: String,
}

pub struct BridgedResponse {
    pub status: u16,
    pub headers: Vec<[String; 2]>,
    pub body: String,
}

pub enum ForwardError {
    WebviewNotReady,
    TooManyInFlight,
    Timeout,
}

pub struct McpBridge {
    listening: AtomicBool,
    webview_ready: AtomicBool,
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, oneshot::Sender<BridgedResponse>>>,
    in_flight: Semaphore,
}

impl McpBridge {
    pub fn new() -> Self {
        Self {
            listening: AtomicBool::new(false),
            webview_ready: AtomicBool::new(false),
            next_id: AtomicU64::new(1),
            pending: Mutex::new(HashMap::new()),
            in_flight: Semaphore::new(MAX_IN_FLIGHT),
        }
    }

    pub fn mark_listening(&self) {
        self.listening.store(true, Ordering::SeqCst);
    }

    pub fn mark_webview_ready(&self, ready: bool) {
        self.webview_ready.store(ready, Ordering::SeqCst);
    }

    pub async fn forward(
        &self,
        app: &AppHandle,
        method: String,
        uri: String,
        headers: Vec<[String; 2]>,
        body: String,
    ) -> Result<BridgedResponse, ForwardError> {
        if !self.webview_ready.load(Ordering::SeqCst) {
            return Err(ForwardError::WebviewNotReady);
        }
        let _slot = self
            .in_flight
            .try_acquire()
            .map_err(|_| ForwardError::TooManyInFlight)?;

        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = oneshot::channel();
        self.pending().insert(id, sender);

        let request = ForwardedRequest {
            id,
            method,
            uri,
            headers,
            body,
        };
        if app.emit_to(MAIN_WINDOW, REQUEST_EVENT, request).is_err() {
            self.pending().remove(&id);
            return Err(ForwardError::WebviewNotReady);
        }

        match tokio::time::timeout(RESPONSE_TIMEOUT, receiver).await {
            Ok(Ok(response)) => Ok(response),
            _ => {
                self.pending().remove(&id);
                Err(ForwardError::Timeout)
            }
        }
    }

    fn pending(&self) -> MutexGuard<'_, HashMap<u64, oneshot::Sender<BridgedResponse>>> {
        self.pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[derive(Serialize)]
pub struct ListenerStatus {
    pub listening: bool,
    pub port: u16,
}

#[tauri::command]
pub fn mcp_http_respond(
    bridge: State<'_, McpBridge>,
    id: u64,
    status: u16,
    headers: Vec<[String; 2]>,
    body: String,
) -> Result<(), String> {
    if body.len() > MAX_BODY_BYTES {
        return Err(format!("response {id} exceeds {MAX_BODY_BYTES} bytes"));
    }
    let sender = bridge
        .pending()
        .remove(&id)
        .ok_or_else(|| format!("request {id} is not waiting for a response"))?;
    sender
        .send(BridgedResponse {
            status,
            headers,
            body,
        })
        .map_err(|_| format!("request {id} timed out before the response arrived"))
}

#[tauri::command]
pub fn mcp_webview_ready(bridge: State<'_, McpBridge>, ready: bool) {
    bridge.mark_webview_ready(ready);
}

#[tauri::command]
pub fn mcp_listener_status(bridge: State<'_, McpBridge>) -> ListenerStatus {
    ListenerStatus {
        listening: bridge.listening.load(Ordering::SeqCst),
        port: PORT,
    }
}
