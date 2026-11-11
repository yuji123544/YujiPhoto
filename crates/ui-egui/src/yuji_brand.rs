//! YujiPhoto branding: the one place the fork's user-visible app name lives.
//!
//! Only what the user sees is renamed (window and title bar, start screen, app menu, About,
//! the Windows executable's version info). Crate names, binaries, the app id and the eframe
//! storage key stay `photocraft` so settings, autosaves and upstream merges keep working.

/// The app name shown in the UI.
pub const NAME: &str = "YujiPhoto";

/// One line for the About dialog.
pub const TAGLINE: &str = "YujiPhoto: a PhotoCraft fork for drawing Roblox VFX. PhotoCraft is an open-source, native image editor written in Rust.";
