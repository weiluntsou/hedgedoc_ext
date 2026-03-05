import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface NoteMapping {
    [filePath: string]: string; // filePath -> noteId
}

interface NoteReverseMapping {
    [noteId: string]: string; // noteId -> filePath
}

export class NoteFileManager {
    private context: vscode.ExtensionContext;
    private mappingKey = 'hedgedoc.noteMapping';
    private mapping: NoteMapping = {};
    private reverseMapping: NoteReverseMapping = {};

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadMapping();
    }

    private loadMapping(): void {
        const saved = this.context.workspaceState.get<NoteMapping>(this.mappingKey, {});
        this.mapping = saved;
        this.reverseMapping = {};
        for (const [filePath, noteId] of Object.entries(saved)) {
            this.reverseMapping[noteId] = filePath;
        }
    }

    private async saveMapping(): Promise<void> {
        await this.context.workspaceState.update(this.mappingKey, this.mapping);
    }

    associateFileWithNote(filePath: string, noteId: string): void {
        // 移除舊的反向對應
        const oldNoteId = this.mapping[filePath];
        if (oldNoteId) {
            delete this.reverseMapping[oldNoteId];
        }

        this.mapping[filePath] = noteId;
        this.reverseMapping[noteId] = filePath;
        this.saveMapping();
    }

    getNoteIdForFile(filePath: string): string | undefined {
        return this.mapping[filePath];
    }

    getLocalPathForNote(noteId: string): string | undefined {
        return this.reverseMapping[noteId];
    }

    async saveNoteLocally(
        noteId: string,
        content: string,
        title?: string
    ): Promise<string> {
        const localFolder = this.getLocalFolder();

        // 確保資料夾存在
        if (!fs.existsSync(localFolder)) {
            fs.mkdirSync(localFolder, { recursive: true });
        }

        // 生成檔名
        let fileName: string;

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

    private extractTitle(content: string): string | undefined {
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

    private getLocalFolder(): string {
        const config = vscode.workspace.getConfiguration('hedgedocSync');
        const configuredFolder = config.get<string>('localFolder', '');

        if (configuredFolder && fs.existsSync(configuredFolder)) {
            return configuredFolder;
        }

        // 使用工作區資料夾
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return path.join(workspaceFolders[0].uri.fsPath, 'hedgedoc-notes');
        }

        // 備用：使用使用者的主目錄
        return path.join(
            process.env.HOME || process.env.USERPROFILE || '~',
            'hedgedoc-notes'
        );
    }

    removeMapping(filePath: string): void {
        const noteId = this.mapping[filePath];
        if (noteId) {
            delete this.reverseMapping[noteId];
        }
        delete this.mapping[filePath];
        this.saveMapping();
    }

    getAllMappings(): NoteMapping {
        return { ...this.mapping };
    }
}
