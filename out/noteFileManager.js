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
exports.NoteFileManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class NoteFileManager {
    constructor(context) {
        this.mappingKey = 'hedgedoc.noteMapping';
        this.mapping = {};
        this.reverseMapping = {};
        this.context = context;
        this.loadMapping();
    }
    loadMapping() {
        const saved = this.context.workspaceState.get(this.mappingKey, {});
        this.mapping = saved;
        this.reverseMapping = {};
        for (const [filePath, noteId] of Object.entries(saved)) {
            this.reverseMapping[noteId] = filePath;
        }
    }
    async saveMapping() {
        await this.context.workspaceState.update(this.mappingKey, this.mapping);
    }
    associateFileWithNote(filePath, noteId) {
        // 移除舊的反向對應
        const oldNoteId = this.mapping[filePath];
        if (oldNoteId) {
            delete this.reverseMapping[oldNoteId];
        }
        this.mapping[filePath] = noteId;
        this.reverseMapping[noteId] = filePath;
        this.saveMapping();
    }
    getNoteIdForFile(filePath) {
        return this.mapping[filePath];
    }
    getLocalPathForNote(noteId) {
        return this.reverseMapping[noteId];
    }
    async saveNoteLocally(noteId, content, title) {
        const localFolder = this.getLocalFolder();
        // 確保資料夾存在
        if (!fs.existsSync(localFolder)) {
            fs.mkdirSync(localFolder, { recursive: true });
        }
        // 生成檔名
        let fileName;
        // 先看是否已有本地路徑
        const existingPath = this.reverseMapping[noteId];
        if (existingPath && fs.existsSync(existingPath)) {
            // 更新現有檔案
            fs.writeFileSync(existingPath, content, 'utf8');
            return existingPath;
        }
        // 從內容中擷取標題
        const titleFromContent = this.extractTitle(content);
        const displayTitle = titleFromContent || title || noteId;
        // 清理檔名 (移除特殊字元)
        const safeTitle = displayTitle
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 80);
        fileName = `${safeTitle}_${noteId.slice(0, 8)}.md`;
        const filePath = path.join(localFolder, fileName);
        fs.writeFileSync(filePath, content, 'utf8');
        this.associateFileWithNote(filePath, noteId);
        return filePath;
    }
    extractTitle(content) {
        // 嘗試從 YAML frontmatter 取得標題
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const titleMatch = frontmatterMatch[1].match(/^title:\s*(.+)$/m);
            if (titleMatch) {
                return titleMatch[1].trim().replace(/^["']|["']$/g, '');
            }
        }
        // 嘗試從第一個 H1 標題取得
        const h1Match = content.match(/^#\s+(.+)$/m);
        if (h1Match) {
            return h1Match[1].trim();
        }
        return undefined;
    }
    getLocalFolder() {
        const config = vscode.workspace.getConfiguration('hedgedocSync');
        const configuredFolder = config.get('localFolder', '');
        if (configuredFolder && fs.existsSync(configuredFolder)) {
            return configuredFolder;
        }
        // 使用工作區資料夾
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return path.join(workspaceFolders[0].uri.fsPath, 'hedgedoc-notes');
        }
        // 備用：使用使用者的主目錄
        return path.join(process.env.HOME || process.env.USERPROFILE || '~', 'hedgedoc-notes');
    }
    removeMapping(filePath) {
        const noteId = this.mapping[filePath];
        if (noteId) {
            delete this.reverseMapping[noteId];
        }
        delete this.mapping[filePath];
        this.saveMapping();
    }
    getAllMappings() {
        return { ...this.mapping };
    }
}
exports.NoteFileManager = NoteFileManager;
