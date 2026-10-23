# 📌 Planned Updates: False-Positive Trigger Prevention & Master Power Switch

## 1. Issue Overview
- **Observed Behavior:** On non-quiz websites (e.g. Discord, YouTube, chat applications, social media), double-clicking normal text or UI elements occasionally triggers the question solver and opens the Explain Side Banner or attempts auto-fill.
- **Root Cause:**
  1. Content script is injected into `<all_urls>` (`manifest.json`).
  2. In `src/content/content.js`, `findQuestionCard()` utilizes broad matching selectors (such as `div[class*="question"]`). When Discord or other web applications use CSS classes containing `question`, the element is incorrectly classified as a quiz question card.
  3. No global pause/kill-switch exists to quickly deactivate the extension during everyday web browsing.

---

## 2. Planned Solutions (Roadmap)

### 🔹 Feature 1: Master Power Switch (Extension ON / OFF) - [x] COMPLETED
- **Location:** Popup Header (left side of theme toggle button) in `src/App.jsx` and `src/App.css`.
- **UI Design:** Responsive sleek modern pill toggle:
  - `🟢 ON` (Extension active on web pages, glowing mint green `#3DDC97` indicator)
  - `⚪ OFF` (Extension completely asleep / muted gray pill)
- **Technical Implementation:**
  - Persisted state via `chrome.storage.local`: `{ extension_active: true/false }` (Default: `true`).
  - Real-time synchronization in `src/content/content.js` via `chrome.storage.onChanged`.
  - In `src/content/content.js`:
    - `dblclick` listener immediately returns if `extension_active === false`.
    - `keydown` listener (`Alt + S`, `Alt + 1/2/3`) immediately returns if `extension_active === false`.
    - `TRIGGER_SNIP_MODE` message safely rejected if `extension_active === false`.
  - In `src/App.jsx`:
    - Popup keyboard shortcuts guarded if `extensionActive === false`.

---

### 🔹 Feature 2: Smart Question Card Validation (False-Positive Guard)
- **Location:** `src/content/content.js` -> `findQuestionCard()` & `hasQuestionInputs()`.
- **Improvements:**
  - Remove overbroad selectors like bare `div[class*="question"]` from fallback matching.
  - Require a verified question card to contain **actual quiz interactive elements**:
    1. Input controls (`input[type="radio"]`, `input[type="checkbox"]`, `<select>`, `<textarea>`) OR
    2. Explicit option markers (e.g. `.option-label`, labels starting with `A)`, `B)`, `C)`, `D)`).
  - Explicitly exclude known chat / social app containers (Discord message containers, chat inputs, contenteditable elements).

---

### 🔹 Feature 3: Site Whitelist / Exclusion (Optional / Phase 3)
- Allow users to toggle:
  - **"Active on all sites"** vs **"Active on this site only"** (e.g. `learn.canvas.net`, `blackboard.com`, `moodle.org`, `forms.google.com`).
  - Automatic exclusion for common communication tools (`discord.com`, `youtube.com`, `reddit.com`).

---

## 3. Related Files
- [`manifest.json`](file:///f:/Learning/extensions/test01/manifest.json)
- [`src/App.jsx`](file:///f:/Learning/extensions/test01/src/App.jsx)
- [`src/App.css`](file:///f:/Learning/extensions/test01/src/App.css)
- [`src/content/content.js`](file:///f:/Learning/extensions/test01/src/content/content.js)
- [`src/background/background.js`](file:///f:/Learning/extensions/test01/src/background/background.js)
