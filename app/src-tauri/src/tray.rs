// tray.rs: IdeaToVideo lives in the tray, like the Claude app (Zoltan,
// 2026-10-05, DECISIONS 87, choice A). The window's close button hides the
// window; the app and every job (a render, a voice, an avatar) keep running.
// The tray icon (Windows: the corner of the taskbar; macOS: the menu bar)
// opens the window again on a click, and its menu has "Open" and "Quit".
// Quit asks first when a job is running, because quitting stops it. The
// first time the window is hidden, one notice says where the app went. The
// tooltip says what runs. The app makes no sound (DECISIONS 85, K10 c).

use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use crate::edition::product;

const TRAY_ID: &str = "main";
const NOTICE_FLAG: &str = "tray-notice-shown";

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    #[allow(non_snake_case)]
    let PRODUCT_NAME = product();
    let open_item = MenuItem::with_id(app, "open", format!("Open {PRODUCT_NAME}"), true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", format!("Quit {PRODUCT_NAME}"), true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(PRODUCT_NAME)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The window back on screen, in front.
pub fn show(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// The close button: hide, never quit. The first time, say where it went.
pub fn on_close(window: &Window) {
    #[allow(non_snake_case)]
    let PRODUCT_NAME = product();
    let _ = window.hide();
    let app = window.app_handle();
    let Ok(dir) = app.path().app_local_data_dir() else { return };
    let flag = dir.join(NOTICE_FLAG);
    if flag.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(&flag, "1");
    app.dialog()
        .message(format!(
            "{PRODUCT_NAME} keeps running in the background, with every job it is working on. Find it in the corner of the taskbar: click its icon to open it again. To quit, right-click the icon and choose Quit."
        ))
        .title(PRODUCT_NAME)
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

/// Quit from the tray menu; asks first when a job is running.
fn quit(app: &AppHandle) {
    #[allow(non_snake_case)]
    let PRODUCT_NAME = product();
    let running = running_jobs(app);
    if running.is_empty() {
        app.exit(0);
        return;
    }
    let handle = app.clone();
    app.dialog()
        .message(format!("{} running. Quitting stops it. Quit anyway?", running.join(", ")))
        .title(PRODUCT_NAME)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Quit".into(), "Keep working".into()))
        .show(move |yes| {
            if yes {
                handle.exit(0);
            }
        });
}

fn label(command: &str) -> &'static str {
    match command {
        "render-video" => "A render is",
        "make-voice" => "The voice is",
        "make-music" => "The music is",
        "make-avatar" | "segment-make" => "An avatar clip is",
        "broll-make" | "broll-paid-approve" => "A B-roll clip is",
        "thumbnail-make" => "A thumbnail is",
        "build-video" | "visual-check" => "The preview is",
        "write-script" => "A script is",
        "make-scenes" | "refill-scene" => "A scene plan is",
        "backup-project" | "backup-all" => "A backup is",
        _ => "",
    }
}

/// The long jobs running now, in words. Quick reads (lists, loads) are left out.
fn running_jobs(app: &AppHandle) -> Vec<String> {
    let jobs = app.state::<crate::Core>().jobs.list();
    let mut out: Vec<String> = jobs
        .as_array()
        .map(|a| a.iter().filter_map(|j| j.get("command").and_then(Value::as_str)).map(label).filter(|l| !l.is_empty()).map(String::from).collect())
        .unwrap_or_default();
    out.dedup();
    out
}

/// The tooltip: what runs, with the render's percent when it is known.
pub fn status(app: &AppHandle, render_percent: Option<i64>) {
    #[allow(non_snake_case)]
    let PRODUCT_NAME = product();
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    let running = running_jobs(app);
    let text = match (running.first(), render_percent) {
        (None, _) => PRODUCT_NAME.to_string(),
        (Some(_), Some(p)) if running.iter().any(|r| r == "A render is") => format!("{PRODUCT_NAME}: rendering, {p}%"),
        (Some(first), _) => format!("{PRODUCT_NAME}: {} running", first.trim_end_matches(" is").to_lowercase()),
    };
    let _ = tray.set_tooltip(Some(text));
}
