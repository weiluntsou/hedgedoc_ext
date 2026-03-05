"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const vscode = __importStar(require("vscode"));
class AuthManager {
    constructor(context) {
        this.SECRET_KEY = 'hedgedoc.sessionCookie';
        this.context = context;
    }
    async configure() {
        const config = vscode.workspace.getConfiguration('hedgedocSync');
        // 設定伺服器 URL
        const currentUrl = config.get('serverUrl', '');
        const serverUrl = await vscode.window.showInputBox({
            prompt: 'HedgeDoc 伺服器網址',
            value: currentUrl,
            placeHolder: '例如：https://hedgedoc.example.com',
            validateInput: (val) => {
                if (!val || !val.startsWith('http')) {
                    return '請輸入有效的 URL (以 http:// 或 https:// 開頭)';
                }
                return undefined;
            }
        });
        if (!serverUrl)
            return;
        await config.update('serverUrl', serverUrl.replace(/\/$/, ''), vscode.ConfigurationTarget.Global);
        // 說明如何取得 Session Cookie
        const action = await vscode.window.showInformationMessage('需要登入 HedgeDoc 才能存取私人筆記。請按「取得 Cookie 教學」了解如何取得 Session Cookie，或直接輸入 Cookie。', '取得 Cookie 教學', '直接輸入 Cookie', '跳過 (僅訪客模式)');
        if (action === '取得 Cookie 教學') {
            await this.showCookieInstructions(serverUrl);
        }
        else if (action === '直接輸入 Cookie') {
            await this.inputCookie();
        }
    }
    async showCookieInstructions(serverUrl) {
        const panel = vscode.window.createWebviewPanel('hedgedocCookieHelp', 'HedgeDoc 登入說明', vscode.ViewColumn.One, { enableScripts: true });
        panel.webview.html = this.getCookieHelpHtml(serverUrl);
        panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'saveCookie') {
                await this.saveCookie(message.cookie);
                panel.dispose();
                vscode.window.showInformationMessage('✅ Cookie 已儲存！正在測試連線...');
                await this.testAndShowResult();
            }
        });
    }
    getCookieHelpHtml(serverUrl) {
        return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HedgeDoc 登入說明</title>
    <style>
        :root {
            --bg: #1a1a2e;
            --surface: #16213e;
            --primary: #0f3460;
            --accent: #e94560;
            --text: #eaeaea;
            --muted: #94a3b8;
            --success: #10b981;
            --code-bg: #0d1117;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 24px;
            line-height: 1.6;
        }
        h1 {
            font-size: 1.5rem;
            font-weight: 700;
            color: #60a5fa;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        h1::before { content: '🔑'; }
        .subtitle {
            color: var(--muted);
            margin-bottom: 28px;
            font-size: 0.95rem;
        }
        .step {
            background: var(--surface);
            border: 1px solid rgba(96,165,250,0.2);
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 16px;
            position: relative;
        }
        .step-number {
            position: absolute;
            top: -12px;
            left: 20px;
            background: #60a5fa;
            color: white;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 2px 10px;
            border-radius: 12px;
        }
        .step h3 {
            font-size: 1rem;
            font-weight: 600;
            margin-bottom: 8px;
            margin-top: 4px;
        }
        .step p {
            color: var(--muted);
            font-size: 0.9rem;
        }
        code {
            background: var(--code-bg);
            color: #f97316;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
        }
        .browser-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(96,165,250,0.1);
            border: 1px solid rgba(96,165,250,0.3);
            color: #60a5fa;
            padding: 6px 14px;
            border-radius: 8px;
            text-decoration: none;
            font-size: 0.9rem;
            margin-top: 8px;
            cursor: pointer;
        }
        textarea {
            width: 100%;
            background: var(--code-bg);
            color: #4ade80;
            border: 1px solid rgba(96,165,250,0.3);
            border-radius: 8px;
            padding: 12px;
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
            resize: vertical;
            min-height: 80px;
            margin-top: 12px;
            outline: none;
        }
        textarea:focus {
            border-color: #60a5fa;
        }
        .save-btn {
            margin-top: 16px;
            padding: 12px 28px;
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .save-btn:hover { opacity: 0.85; }
        .tip {
            background: rgba(16,185,129,0.1);
            border: 1px solid rgba(16,185,129,0.3);
            border-radius: 8px;
            padding: 12px 16px;
            font-size: 0.9rem;
            color: #6ee7b7;
            margin-top: 16px;
        }
        .tip strong { color: #10b981; }
    </style>
</head>
<body>
    <h1>取得 HedgeDoc Session Cookie</h1>
    <p class="subtitle">需要 Session Cookie 才能以登入身份存取您的私人筆記</p>

    <div class="step">
        <div class="step-number">步驟 1</div>
        <h3>在瀏覽器登入 HedgeDoc</h3>
        <p>請先在瀏覽器中登入您的 HedgeDoc 站台</p>
        <button class="browser-link" onclick="openBrowser()">🌐 開啟 ${serverUrl}</button>
    </div>

    <div class="step">
        <div class="step-number">步驟 2</div>
        <h3>開啟開發者工具</h3>
        <p>按下 <code>F12</code> 或 <code>Cmd+Option+I</code> (Mac) 開啟開發者工具，點選「Application」(Chrome) 或「Storage」(Firefox) 分頁</p>
    </div>

    <div class="step">
        <div class="step-number">步驟 3</div>
        <h3>找到 Session Cookie</h3>
        <p>在左側選單找到「Cookies」→ <code>${serverUrl}</code>，找到名為 <code>connect.sid</code> 的 Cookie，複製其「Value」欄位的值</p>
    </div>

    <div class="step">
        <div class="step-number">步驟 4</div>
        <h3>貼上 Cookie 值</h3>
        <p>將複製的 Cookie 值貼到下方，格式為 <code>connect.sid=YOUR_VALUE</code></p>
        <textarea id="cookieInput" placeholder="connect.sid=s%3AXxxxxx..."></textarea>
        <br>
        <button class="save-btn" onclick="saveCookie()">💾 儲存並連線</button>
    </div>

    <div class="tip">
        <strong>🔒 安全提醒：</strong> Cookie 將以加密方式儲存在 VS Code 的 SecretStorage 中，不會明文保存。
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function openBrowser() {
            vscode.postMessage({ command: 'openBrowser', url: '${serverUrl}' });
        }

        function saveCookie() {
            const cookie = document.getElementById('cookieInput').value.trim();
            if (!cookie) {
                alert('請輸入 Cookie 值');
                return;
            }
            vscode.postMessage({ command: 'saveCookie', cookie });
        }
    </script>
</body>
</html>`;
    }
    async inputCookie() {
        const cookie = await vscode.window.showInputBox({
            prompt: '輸入 HedgeDoc Session Cookie',
            placeHolder: 'connect.sid=s%3AXxxxxx...',
            password: true,
        });
        if (cookie) {
            await this.saveCookie(cookie);
            await this.testAndShowResult();
        }
    }
    async saveCookie(cookie) {
        // 確保格式正確
        let normalizedCookie = cookie.trim();
        if (!normalizedCookie.startsWith('connect.sid=')) {
            normalizedCookie = `connect.sid=${normalizedCookie}`;
        }
        await this.context.secrets.store(this.SECRET_KEY, normalizedCookie);
    }
    async getSessionCookie() {
        return this.context.secrets.get(this.SECRET_KEY);
    }
    async clearCookie() {
        await this.context.secrets.delete(this.SECRET_KEY);
    }
    async testAndShowResult() {
        try {
            const { HedgeDocClient } = await Promise.resolve().then(() => __importStar(require('./hedgedocClient')));
            const testClient = new HedgeDocClient(this);
            const result = await testClient.testConnection();
            if (result.loggedIn) {
                vscode.window.showInformationMessage(`✅ 已成功連線！歡迎，${result.username}`);
            }
            else {
                vscode.window.showWarningMessage('連線成功，但您目前以訪客身份登入。私人筆記可能無法存取。');
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`❌ 連線測試失敗: ${err.message}`);
        }
    }
}
exports.AuthManager = AuthManager;
