mod invoice_sender;
mod mcp_bridge;
#[cfg(desktop)]
mod mcp_listener;

use tauri::webview::PageLoadEvent;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .manage(mcp_bridge::McpBridge::new())
        .on_page_load(|webview, payload| {
            if webview.label() == mcp_bridge::MAIN_WINDOW
                && matches!(payload.event(), PageLoadEvent::Started)
            {
                webview
                    .state::<mcp_bridge::McpBridge>()
                    .mark_webview_ready(false);
            }
        })
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .build(),
            )?;
            #[cfg(desktop)]
            mcp_listener::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            invoice_sender::send_invoice,
            mcp_bridge::mcp_http_respond,
            mcp_bridge::mcp_webview_ready,
            mcp_bridge::mcp_listener_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
