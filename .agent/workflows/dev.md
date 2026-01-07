---
description: Run the application in development mode
---

## Prerequisites

1. **Node.js** - Install via nvm or package manager
2. **Rust** - Install via [rustup](https://rustup.rs/)
3. **Tauri CLI** - Included in devDependencies

## Running in Dev Mode

// turbo-all

1. Navigate to project directory:
   ```bash
   cd /run/media/ganendr/extremeSSD/POTracker
   ```

2. Install npm dependencies (first time or after package.json changes):
   ```bash
   npm install
   ```

3. Run the Tauri development server:
   ```bash
   npm run tauri dev
   ```

This will:
- Start Vite dev server with hot module reloading
- Compile the Rust backend in debug mode
- Open the application window automatically

## Frontend-Only Development (Faster Iteration)

For UI-only changes where you don't need Rust backend features:

```bash
npm run dev
```

Then open http://localhost:1420 in your browser.

> **Note:** Some features requiring Tauri commands (email sending, Google OAuth, database) won't work in browser-only mode.

## Build for Production

```bash
npm run tauri build
```

This creates an optimized production build in `src-tauri/target/release/`.

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server only |
| `npm run build` | Build frontend for production |
| `npm run tauri dev` | Full Tauri dev mode |
| `npm run tauri build` | Build production app |
| `cargo check` | Check Rust code without building |
| `cargo build` | Build Rust backend |

## Troubleshooting

### npm not found
If using nvm, ensure it's loaded:
```bash
source ~/.nvm/nvm.sh
nvm use --lts
```

### Rust compilation errors
Make sure you have the required system dependencies:
```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel openssl-devel curl wget libappindicator-gtk3 librsvg2-devel
```
