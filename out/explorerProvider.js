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
exports.HedgeDocExplorerProvider = exports.NoteTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
class NoteTreeItem extends vscode.TreeItem {
    constructor(label, noteId, pinned, updateTime) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.noteId = noteId;
        this.pinned = pinned;
        this.updateTime = updateTime;
        this.tooltip = `ID: ${noteId}\n最後更新: ${new Date(updateTime).toLocaleString('zh-TW')}`;
        this.description = new Date(updateTime).toLocaleDateString('zh-TW');
        this.contextValue = 'note';
        this.iconPath = new vscode.ThemeIcon(pinned ? 'pinned' : 'file-text');
        this.command = {
            command: 'hedgedoc.pullNote',
            title: '開啟筆記',
            arguments: [this],
        };
    }
}
exports.NoteTreeItem = NoteTreeItem;
class LoadingItem extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
        this.contextValue = 'loading';
    }
}
class ErrorItem extends vscode.TreeItem {
    constructor(message) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('error');
        this.contextValue = 'error';
        this.tooltip = '點擊設定連線';
        this.command = {
            command: 'hedgedoc.configure',
            title: '設定連線',
        };
    }
}
class HedgeDocExplorerProvider {
    constructor(client, noteFileManager) {
        this.client = client;
        this.noteFileManager = noteFileManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.notes = [];
        this.loading = false;
        this.error = null;
    }
    refresh() {
        this._onDidChangeTreeData.fire(null);
        this.loadNotes();
    }
    async loadNotes() {
        this.loading = true;
        this.error = null;
        this._onDidChangeTreeData.fire(null);
        try {
            this.notes = await this.client.getHistory();
            // 釘選的放前面，然後按時間排序
            this.notes.sort((a, b) => {
                if (a.pinned && !b.pinned)
                    return -1;
                if (!a.pinned && b.pinned)
                    return 1;
                return b.time - a.time;
            });
        }
        catch (err) {
            this.error = err.message;
            this.notes = [];
        }
        finally {
            this.loading = false;
            this._onDidChangeTreeData.fire(null);
        }
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (element)
            return [];
        if (this.loading) {
            return [new LoadingItem('正在載入筆記列表...')];
        }
        if (this.error) {
            const items = [];
            if (this.error.includes('未登入') || this.error.includes('Session') || this.error.includes('403') || this.error.includes('401')) {
                items.push(new ErrorItem('⚠️ 未登入，點此設定 Cookie'));
            }
            else {
                items.push(new ErrorItem(`❌ ${this.error}`));
            }
            return items;
        }
        if (this.notes.length === 0) {
            const emptyItem = new vscode.TreeItem('沒有筆記歷史，請先建立或開啟筆記');
            emptyItem.iconPath = new vscode.ThemeIcon('info');
            return [emptyItem];
        }
        return this.notes.map(note => {
            const title = note.text || note.id;
            const localPath = this.noteFileManager.getLocalPathForNote(note.id);
            const isDownloaded = localPath ? fs.existsSync(localPath) : false;
            const item = new NoteTreeItem(title, note.id, note.pinned || false, note.time);
            if (isDownloaded) {
                item.description = `✓ ${item.description}`;
            }
            return item;
        });
    }
}
exports.HedgeDocExplorerProvider = HedgeDocExplorerProvider;
