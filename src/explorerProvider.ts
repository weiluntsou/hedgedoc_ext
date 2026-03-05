import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { HedgeDocClient, HistoryNote } from './hedgedocClient';
import { NoteFileManager } from './noteFileManager';

export class NoteTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly noteId: string,
        public readonly pinned: boolean,
        public readonly updateTime: number,
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);

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

class LoadingItem extends vscode.TreeItem {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('loading~spin');
        this.contextValue = 'loading';
    }
}

class ErrorItem extends vscode.TreeItem {
    constructor(message: string) {
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

export class HedgeDocExplorerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private notes: HistoryNote[] = [];
    private loading = false;
    private error: string | null = null;

    constructor(
        private client: HedgeDocClient,
        private noteFileManager: NoteFileManager,
    ) { }

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
        this.loadNotes();
    }

    private async loadNotes(): Promise<void> {
        this.loading = true;
        this.error = null;
        this._onDidChangeTreeData.fire(null);

        try {
            this.notes = await this.client.getHistory();
            // 釘選的放前面，然後按時間排序
            this.notes.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return b.time - a.time;
            });
        } catch (err: any) {
            this.error = err.message;
            this.notes = [];
        } finally {
            this.loading = false;
            this._onDidChangeTreeData.fire(null);
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) return [];

        if (this.loading) {
            return [new LoadingItem('正在載入筆記列表...')];
        }

        if (this.error) {
            const items: vscode.TreeItem[] = [];

            if (this.error.includes('未登入') || this.error.includes('Session') || this.error.includes('403') || this.error.includes('401')) {
                items.push(new ErrorItem('⚠️ 未登入，點此設定 Cookie'));
            } else {
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

            const item = new NoteTreeItem(
                title,
                note.id,
                note.pinned || false,
                note.time,
            );

            if (isDownloaded) {
                item.description = `✓ ${item.description}`;
            }

            return item;
        });
    }
}
