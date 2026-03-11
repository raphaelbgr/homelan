use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let quit_item = MenuItem::with_id(app, "quit", "Quit HomeLAN", true, None::<&str>)?;
            let connect_item = MenuItem::with_id(app, "connect", "Connect", true, None::<&str>)?;
            let disconnect_item = MenuItem::with_id(app, "disconnect", "Disconnect", true, None::<&str>)?;
            let lan_only_item = MenuItem::with_id(app, "lan_only", "Switch to LAN Only", true, None::<&str>)?;
            let full_gw_item = MenuItem::with_id(app, "full_gateway", "Switch to Full Gateway", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[&connect_item, &disconnect_item, &lan_only_item, &full_gw_item, &quit_item],
            )?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "connect" => {
                        app.emit("tray-connect", ()).ok();
                    }
                    "disconnect" => {
                        app.emit("tray-disconnect", ()).ok();
                    }
                    "lan_only" => {
                        app.emit("tray-switch-mode", "lan-only").ok();
                    }
                    "full_gateway" => {
                        app.emit("tray-switch-mode", "full-gateway").ok();
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                window.hide().ok();
                            } else {
                                window.show().ok();
                                window.set_focus().ok();
                            }
                        }
                    }
                })
                .build(app)?;

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
