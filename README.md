# POTracker

A cross-platform pre-order tracking application built with Tauri v2, React, and TypeScript.

## Features

### 📦 Product Management
- Create, edit, and delete products with images
- Multi-currency pricing support (USD, EUR, GBP, JPY, IDR, and more)
- Drag & drop or URL-based image uploads
- Organize products by events/campaigns

### 📋 Order Tracking
- Create pre-orders with unique confirmation codes
- QR code generation for order verification
- Track order status (pending, sent, confirmed)
- Order history dashboard with statistics

### 📅 Event Management
- Create events/campaigns to organize products and orders
- Filter products and orders by event
- Date range tracking for events

### 📧 Email Integration
- Automatic invoice emails with QR codes
- Gmail OAuth integration
- SMTP email configuration support
- Order confirmation emails

### 📝 Google Forms Integration
- Connect to Google Forms for order collection
- Auto-sync form responses
- Automatic order creation from form submissions
- Google Drive folder sync for product data

### 📱 Mobile Features
- Barcode/QR code scanner for order confirmation
- Responsive design for mobile devices
- iOS and Android support

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Tauri v2 (Rust)
- **Database**: SQLite (via tauri-plugin-sql)
- **Styling**: Custom CSS with CSS variables

## Requirements

### Development
- **Node.js**: v20 or higher
- **Rust**: Latest stable version
- **npm**: v9 or higher

### Platform-Specific

#### Linux
```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev build-essential curl wget libssl-dev
```

#### macOS
```bash
xcode-select --install
```

#### Windows
- Microsoft Visual Studio C++ Build Tools
- WebView2 (usually pre-installed on Windows 10/11)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/POTracker.git
   cd POTracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```
   
   Configure the following variables:
   ```env
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   VITE_GOOGLE_CLIENT_SECRET=your_google_client_secret
   VITE_API_URL=your_api_url (optional)
   ```

4. **Run in development mode**
   ```bash
   npm run tauri dev
   ```

## Building

### Desktop
```bash
npm run tauri build
```

This will create:
- **Linux**: `.deb`, `.rpm` packages
- **macOS**: `.dmg`, `.app` bundle
- **Windows**: `.msi`, `.exe` (NSIS) installers

### Mobile

```bash
# iOS
npm run tauri ios build

# Android
npm run tauri android build
```

### Flatpak (Linux)
```bash
flatpak-builder --user --install-deps-from=flathub --force-clean build-dir com.ganendr.potracker.yml
flatpak build-bundle repo POTracker.flatpak com.ganendr.potracker
```

## Google Cloud Setup

To enable Google Forms and Gmail integration:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the following APIs:
   - Google Forms API
   - Google Drive API
   - Gmail API
3. Create OAuth 2.0 credentials (Desktop application)
4. Add your Client ID and Secret to the `.env` file

## Project Structure

```
POTracker/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source code
│   └── icons/              # App icons
├── .github/workflows/      # CI/CD workflows
└── com.ganendr.potracker.* # Flatpak config files
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
