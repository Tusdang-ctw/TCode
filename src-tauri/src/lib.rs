use std::fs;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

pub struct ServerProcess(pub Mutex<Option<std::process::Child>>);

/// Find the node executable by checking common locations.
fn find_node() -> Option<String> {
    let candidates = [
        "node",
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
    ];
    for candidate in &candidates {
        if Command::new(candidate).arg("--version").output().is_ok() {
            return Some(candidate.to_string());
        }
    }
    None
}

/// Spawn the Node.js backend server as a child process.
/// In production, sets NODE_PATH so native modules (better-sqlite3, node-pty)
/// resolve from the bundled resource directory.
fn start_node_server(app: &AppHandle) -> Option<std::process::Child> {
    let node = find_node()?;

    let resource_dir = app.path().resource_dir().ok()?;
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();

    // Production: server.cjs is bundled inside the app resources.
    // Try multiple locations — Tauri resource_dir, and the _up_ folder next to the exe (NSIS).
    let prod_candidates = [
        resource_dir.join("dist-server").join("server.cjs"),
        exe_dir.join("_up_").join("dist-server").join("server.cjs"),
        exe_dir.join("dist-server").join("server.cjs"),
    ];

    // Dev: navigate from the compiled binary back to the project root.
    // Binary location: <project>/src-tauri/target/debug/tcode.exe
    // Project root:    <project>/  (4 levels up)
    let dev_path = exe_dir
        .parent()  // target/ or debug/
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|root| root.join("dist-server").join("server.cjs"));

    // Find the first path that exists
    let (server_path, is_production) = prod_candidates
        .iter()
        .find(|p| p.exists())
        .map(|p| (p.clone(), true))
        .or_else(|| dev_path.filter(|p| p.exists()).map(|p| (p, false)))
        .or_else(|| {
            eprintln!("[server] Could not locate dist-server/server.cjs");
            eprintln!("[server] Searched: {:?}", prod_candidates);
            None
        })?;

    eprintln!("[server] Spawning: {} {:?}", node, server_path);

    // Write server logs to ~/.tcode/server.log for debugging
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    let log_dir = std::path::PathBuf::from(home).join(".tcode");
    let _ = fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("server.log");
    eprintln!("[server] Log file: {:?}", log_path);

    let log_file = fs::File::create(&log_path).ok();
    let stderr_file = log_file.as_ref().and_then(|f| f.try_clone().ok());

    let mut cmd = Command::new(&node);
    cmd.arg(&server_path);

    if let Some(out) = log_file {
        cmd.stdout(Stdio::from(out));
    }
    if let Some(err) = stderr_file {
        cmd.stderr(Stdio::from(err));
    }

    // In production, native modules are bundled alongside server.cjs.
    // server.cjs is at <somewhere>/dist-server/server.cjs, so node_modules is at <somewhere>/node_modules/
    if is_production {
        if let Some(dist_server_dir) = server_path.parent() {
            if let Some(bundle_root) = dist_server_dir.parent() {
                let node_modules_path = bundle_root.join("node_modules");
                eprintln!("[server] NODE_PATH = {:?}", node_modules_path);
                cmd.env("NODE_PATH", &node_modules_path);
            }
        }
    }

    // Hide the console window on Windows
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.spawn()
        .map_err(|e| eprintln!("[server] Failed to spawn: {}", e))
        .ok()
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

            if find_node().is_none() {
                eprintln!("[server] ERROR: Node.js not found on this system");
                handle.dialog()
                    .message("Node.js is required but was not found on this system.\n\nPlease install Node.js from https://nodejs.org and restart TCode.")
                    .kind(MessageDialogKind::Error)
                    .title("TCode — Node.js Not Found")
                    .blocking_show();
            }

            let child = start_node_server(&handle);
            if child.is_none() {
                eprintln!("[server] WARNING: backend server did not start");
            }
            *server_state.0.lock().unwrap() = child;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![server_status])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Kill the Node.js server (and its PTY children) when the app exits
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<ServerProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(mut child) = guard.take() {
                    eprintln!("[server] Shutting down backend server");
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
