use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct ServerProcess(pub Mutex<Option<std::process::Child>>);

/// Spawn the Node.js backend server as a child process
fn start_node_server(app: &AppHandle) -> Option<std::process::Child> {
    // In production: bundled dist-server/server.js inside resources
    let server_path = app
        .path()
        .resource_dir()
        .ok()?
        .join("dist-server")
        .join("server.js");

    // Fall back to dev path (workspace root / dist-server / server.js)
    let path = if server_path.exists() {
        server_path
    } else {
        let mut dev = std::env::current_dir().ok()?;
        dev.push("dist-server");
        dev.push("server.js");
        dev
    };

    let child = Command::new("node")
        .arg(&path)
        .spawn()
        .ok()?;

    Some(child)
}

#[tauri::command]
fn server_status(state: State<'_, ServerProcess>) -> String {
    let guard = state.0.lock().unwrap();
    if guard.is_some() { "running".into() } else { "stopped".into() }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let server_state: State<ServerProcess> = app.state();
            let child = start_node_server(&handle);
            *server_state.0.lock().unwrap() = child;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![server_status])
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Process cleanup handled by OS when parent exits
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
