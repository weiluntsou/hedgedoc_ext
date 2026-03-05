import * as vscode from 'vscode';
import { HedgeDocClient } from './hedgedocClient';
import { HedgeDocExplorerProvider } from './explorerProvider';
import { NoteFileManager } from './noteFileManager';
import { AuthManager } from './authManager';

let explorerProvider: HedgeDocExplorerProvider;
let client: HedgeDocClient;
let noteFileManager: NoteFileManager;
let authManager: AuthManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('HedgeDoc Sync 已啟動');

    authManager = new AuthManager(context);
    client = new HedgeDocClient(authManager);
    noteFileManager = new NoteFileManager(context);
    explorerProvider = new HedgeDocExplorerProvider(client, noteFileManager);

    // 註冊 Explorer Tree View
    const treeView = vscode.window.createTreeView('hedgedocExplorer', {
        treeDataProvider: explorerProvider,
        showCollapseAll: false,
    });
    context.subscriptions.push(treeView);

    // 命令: 設定連線
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.configure', async () => {
            await authManager.configure();
            explorerProvider.refresh();
        })
    );

    // 命令: 重新整理
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.refreshExplorer', () => {
            explorerProvider.refresh();
        })
    );

    // 命令: 拉取筆記 (從 Explorer 或 Editor)
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.pullNote', async (noteItem?: any) => {
            await pullNote(noteItem, context);
        })
    );

    // 命令: 推送筆記
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.pushNote', async () => {
            await pushNote();
        })
    );

    // 命令: 建立新筆記
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.newNote', async () => {
            await createNewNote(context);
        })
    );

    // 命令: 在瀏覽器開啟
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.openInBrowser', async (noteItem?: any) => {
            await openInBrowser(noteItem);
        })
    );

    // 命令: 刪除筆記
    context.subscriptions.push(
        vscode.commands.registerCommand('hedgedoc.deleteNote', async (noteItem?: any) => {
            await deleteNote(noteItem);
        })
    );

    // 自動儲存時同步
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            const config = vscode.workspace.getConfiguration('hedgedocSync');
            const autoSync = config.get<boolean>('autoSyncOnSave', false);
            if (autoSync && doc.fileName.endsWith('.md')) {
                const noteId = noteFileManager.getNoteIdForFile(doc.fileName);
                if (noteId) {
                    await pushNoteContent(doc, noteId);
                }
            }
        })
    );

    // 初始化時嘗試載入歷史
    explorerProvider.refresh();

    // 顯示歡迎訊息
    vscode.window.showInformationMessage('HedgeDoc Sync 已啟動！點擊活動欄的 HedgeDoc 圖示開始使用。');
}

async function pullNote(noteItem: any, context: vscode.ExtensionContext) {
    let noteId: string | undefined;
    let noteTitle: string | undefined;

    if (noteItem && noteItem.noteId) {
        noteId = noteItem.noteId;
        noteTitle = noteItem.label;
    } else {
        // 從當前開啟的檔案取得 noteId
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            noteId = noteFileManager.getNoteIdForFile(editor.document.fileName);
        }

        if (!noteId) {
            // 手動輸入
            noteId = await vscode.window.showInputBox({
                prompt: '輸入 HedgeDoc 筆記 ID 或 URL',
                placeHolder: '例如: abc123 或 https://notes.weiluntsou.com/abc123',
            });
            if (!noteId) return;

            // 從 URL 中擷取 ID
            const urlMatch = noteId.match(/\/([^/]+)\/?$/);
            if (urlMatch) noteId = urlMatch[1];
        }
    }

    if (!noteId) return;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在拉取筆記...',
        cancellable: false,
    }, async () => {
        try {
            const content = await client.downloadNote(noteId!);
            const localPath = await noteFileManager.saveNoteLocally(
                noteId!,
                content,
                noteTitle
            );

            const doc = await vscode.workspace.openTextDocument(localPath);
            await vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage(`✅ 筆記已同步: ${noteTitle || noteId}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`❌ 拉取失敗: ${err.message}`);
        }
    });
}

async function pushNote() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.fileName.endsWith('.md')) {
        vscode.window.showWarningMessage('請先開啟一個 Markdown 檔案');
        return;
    }

    const doc = editor.document;
    const noteId = noteFileManager.getNoteIdForFile(doc.fileName);

    if (!noteId) {
        // 詢問是否建立新筆記
        const choice = await vscode.window.showQuickPick(
            ['建立新 HedgeDoc 筆記', '指定現有筆記 ID'],
            { placeHolder: '此文件尚未與 HedgeDoc 筆記關聯，請選擇操作' }
        );

        if (choice === '建立新 HedgeDoc 筆記') {
            await createNoteFromCurrentFile(doc);
        } else if (choice === '指定現有筆記 ID') {
            const id = await vscode.window.showInputBox({
                prompt: '輸入要推送到的 HedgeDoc 筆記 ID',
                placeHolder: '例如: abc123xyz',
            });
            if (id) {
                noteFileManager.associateFileWithNote(doc.fileName, id);
                await pushNoteContent(doc, id);
            }
        }
        return;
    }

    await pushNoteContent(doc, noteId);
}

async function pushNoteContent(doc: vscode.TextDocument, noteId: string) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在推送筆記...',
        cancellable: false,
    }, async () => {
        try {
            const content = doc.getText();
            await client.updateNote(noteId, content);
            vscode.window.showInformationMessage(`✅ 筆記已推送: ${noteId}`);
        } catch (err: any) {
            // 'HANDLED' 代表 client 已自行處理（例如開啟瀏覽器或複製到剪貼簿），不需再顯示錯誤
            if (err.message === 'HANDLED') return;
            vscode.window.showErrorMessage(`❌ 推送失敗: ${err.message}`);
        }
    });
}

async function createNewNote(context: vscode.ExtensionContext) {
    const title = await vscode.window.showInputBox({
        prompt: '輸入新筆記標題',
        placeHolder: '新筆記',
    });

    const initialContent = title
        ? `# ${title}\n\n`
        : '# 新筆記\n\n';

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在建立新筆記...',
        cancellable: false,
    }, async () => {
        try {
            const noteId = await client.createNote(initialContent);
            const localPath = await noteFileManager.saveNoteLocally(
                noteId,
                initialContent,
                title || 'new-note'
            );

            const doc = await vscode.workspace.openTextDocument(localPath);
            await vscode.window.showTextDocument(doc);

            explorerProvider.refresh();
            vscode.window.showInformationMessage(`✅ 已建立新筆記: ${noteId}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`❌ 建立失敗: ${err.message}`);
        }
    });
}

async function createNoteFromCurrentFile(doc: vscode.TextDocument) {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在上傳筆記...',
        cancellable: false,
    }, async () => {
        try {
            const content = doc.getText();
            const noteId = await client.createNote(content);
            noteFileManager.associateFileWithNote(doc.fileName, noteId);

            const config = vscode.workspace.getConfiguration('hedgedocSync');
            const serverUrl = config.get<string>('serverUrl', 'https://notes.weiluntsou.com');

            explorerProvider.refresh();
            vscode.window.showInformationMessage(
                `✅ 已上傳到 HedgeDoc: ${noteId}`,
                '在瀏覽器開啟'
            ).then(action => {
                if (action === '在瀏覽器開啟') {
                    vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/${noteId}`));
                }
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`❌ 上傳失敗: ${err.message}`);
        }
    });
}

async function openInBrowser(noteItem: any) {
    const config = vscode.workspace.getConfiguration('hedgedocSync');
    const serverUrl = config.get<string>('serverUrl', 'https://notes.weiluntsou.com');

    let noteId: string | undefined;

    if (noteItem && noteItem.noteId) {
        noteId = noteItem.noteId;
    } else {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            noteId = noteFileManager.getNoteIdForFile(editor.document.fileName);
        }
    }

    if (!noteId) {
        vscode.window.showWarningMessage('無法確定筆記 ID，請先拉取或關聯筆記');
        return;
    }

    vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/${noteId}`));
}

async function deleteNote(noteItem: any) {
    if (!noteItem || !noteItem.noteId) {
        vscode.window.showWarningMessage('請在筆記列表中選擇要刪除的筆記');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `確定要從 HedgeDoc 刪除筆記「${noteItem.label}」嗎？`,
        { modal: true },
        '確定刪除'
    );

    if (confirm !== '確定刪除') return;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在刪除筆記...',
        cancellable: false,
    }, async () => {
        try {
            await client.deleteNote(noteItem.noteId);
            explorerProvider.refresh();
            vscode.window.showInformationMessage(`✅ 已刪除筆記: ${noteItem.label}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`❌ 刪除失敗: ${err.message}`);
        }
    });
}

export function deactivate() { }
