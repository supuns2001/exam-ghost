# React Chrome Extension (Manifest V3 + Vite)

A modern, high-performance Chrome Extension starter template built with **React**, **JavaScript**, **Vite**, and **Manifest V3**.

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Extension
```bash
npm run build
```
This will compile your extension and generate all production files in the `dist/` folder.

### 3. Load into Google Chrome
1. Open Google Chrome and go to: `chrome://extensions`
2. Enable **Developer mode** (toggle at top-right corner).
3. Click **Load unpacked** (top-left button).
4. Select the `dist/` directory inside this project:
   `F:\Learning\extensions\test01\dist`
5. Pin the extension to your toolbar and click the icon to open the popup!

### 4. Development with Hot Reloading (HMR)
```bash
npm run dev
```
With `@crxjs/vite-plugin`, changes to your React popup, content scripts, and styles reload automatically!

---

## 📁 Project Structure

```
├── manifest.json            # Extension configuration & permissions (Manifest V3)
├── vite.config.js           # Vite + CRX plugin config
├── index.html               # Popup HTML root
├── src/
│   ├── App.jsx              # Main popup UI (Tabs, status toggle, stats)
│   ├── App.css              # Glassmorphic dark theme styles
│   ├── main.jsx             # React entry point
│   ├── index.css            # Base reset & popup dimensions
│   ├── background/
│   │   └── index.js         # Service Worker (lifecycle, messaging)
│   └── content/
│       └── index.js         # Content script (injected into web pages)
├── public/
│   └── icons/               # Extension icons (16, 32, 48, 128)
└── scripts/
    └── generate-icons.js    # PNG icon generator script
```

---

## 🛠️ Key Chrome Extension APIs Included

- **`chrome.storage.local`**: Persist user settings and data across browser sessions.
- **`chrome.tabs.query` / `chrome.tabs.sendMessage`**: Inspect and communicate with the active browser tab.
- **`chrome.runtime.onMessage` / `chrome.runtime.sendMessage`**: Two-way messaging between Popup, Background Service Worker, and Content Script.

---

## 💡 How to Customize for Your Idea

- **To modify the Popup UI**: Edit [src/App.jsx](file:///f:/Learning/extensions/test01/src/App.jsx).
- **To manipulate web pages (DOM, scraping, styling)**: Edit [src/content/index.js](file:///f:/Learning/extensions/test01/src/content/index.js).
- **To handle background jobs, alarms, or API requests**: Edit [src/background/index.js](file:///f:/Learning/extensions/test01/src/background/index.js).
- **To request more permissions**: Add them to `permissions` in [manifest.json](file:///f:/Learning/extensions/test01/manifest.json).
