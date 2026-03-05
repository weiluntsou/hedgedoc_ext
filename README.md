# HedgeDoc Sync for VS Code

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.74.0-blueviolet)

將你的 [HedgeDoc](https://hedgedoc.org) 自架筆記站台與 VS Code 雙向同步。

## ✨ 功能

| 功能 | 說明 |
|------|------|
| 📥 **拉取筆記** | 從 HedgeDoc 下載 Markdown 到本地，並在 VS Code 中開啟 |
| 📤 **推送筆記** | 將本地編輯後的內容同步回 HedgeDoc |
| 📋 **筆記列表** | 在側邊欄瀏覽所有歷史筆記，支援釘選顯示 |
| ➕ **建立筆記** | 直接在 VS Code 中建立新的 HedgeDoc 筆記 |
| 🌐 **在瀏覽器開啟** | 快速跳轉到 HedgeDoc 網頁版進行協作 |
| 💾 **自動同步** | 儲存 Markdown 時自動推送（可選開啟） |
| 🔒 **安全認證** | Session Cookie 使用 VS Code SecretStorage 加密儲存 |

## 🚀 快速開始

### 1. 設定連線

點擊左側活動欄的 **HedgeDoc 圖示**，再點選設定齒輪，或執行命令：

```
HedgeDoc: 設定連線
```

### 2. 取得 Session Cookie（登入驗證）

1. 在瀏覽器登入你的 HedgeDoc 站台（`https://notes.weiluntsou.com`）
2. 按 `F12` 開啟開發者工具
3. 前往 **Application** → **Cookies** → 找到 `connect.sid`
4. 複製 Cookie 值並貼入 VS Code 設定畫面

### 3. 開始同步

- **側邊欄**：點擊筆記即可下載並開啟
- **編輯器工具列**：
  - ☁️↓ 拉取（從 HedgeDoc 更新本地）
  - ☁️↑ 推送（上傳本地修改）
  - 🔗 在瀏覽器開啟

## ⚙️ 設定選項

| 設定 | 預設值 | 說明 |
|------|--------|------|
| `hedgedocSync.serverUrl` | `https://notes.weiluntsou.com` | HedgeDoc 伺服器網址 |
| `hedgedocSync.localFolder` | _(工作區)_ | 本地儲存位置 |
| `hedgedocSync.autoSyncOnSave` | `false` | 儲存時自動推送 |

## ⚠️ 關於 HedgeDoc 1.x 的推送限制

HedgeDoc **1.x** 版本的官方 API **不支援**直接更新現有筆記的內容（只能建立和下載）。

HedgeDoc Sync 提供以下因應方式：

1. **瀏覽器 + 剪貼簿**：自動複製最新 Markdown 到剪貼簿，並開啟瀏覽器，你只需在筆記中全選後貼上。
2. **建立新版本**：將修改後的內容建立為新筆記。

> 💡 **HedgeDoc 2.x** 提供完整 REST API，未來將支援直接推送。

## 📁 本地檔案結構

筆記預設儲存在工作區的 `hedgedoc-notes/` 資料夾：

```
your-workspace/
└── hedgedoc-notes/
    ├── 我的第一篇筆記_abc12345.md
    ├── 專案規劃_def67890.md
    └── ...
```

檔名格式：`{標題}_{筆記ID前8碼}.md`

## 🛠️ 開發

```bash
# 安裝依賴
npm install

# 編譯
npm run compile

# 監視模式（自動重新編譯）
npm run watch
```

按 `F5` 在 Extension Development Host 中測試插件。

## 📄 授權

MIT License
