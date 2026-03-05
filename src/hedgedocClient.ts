import * as vscode from 'vscode';
import { AuthManager } from './authManager';

export interface HistoryNote {
    id: string;
    text: string;
    time: number;
    tags?: string[];
    pinned?: boolean;
}

export interface NoteInfo {
    title: string;
    description?: string;
    viewCount: number;
    updateTime: number;
    createTime: number;
}

export class HedgeDocClient {
    private authManager: AuthManager;

    constructor(authManager: AuthManager) {
        this.authManager = authManager;
    }

    private getServerUrl(): string {
        const config = vscode.workspace.getConfiguration('hedgedocSync');
        return config.get<string>('serverUrl', 'https://notes.weiluntsou.com').replace(/\/$/, '');
    }

    private async getHeaders(contentType = 'application/json'): Promise<Record<string, string>> {
        const cookie = await this.authManager.getSessionCookie();
        const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Accept': 'application/json, text/plain, */*',
        };
        if (cookie) {
            headers['Cookie'] = cookie;
        }
        return headers;
    }

    async testConnection(): Promise<{ username: string; loggedIn: boolean }> {
        const url = `${this.getServerUrl()}/me`;
        const headers = await this.getHeaders();

        const response = await this.safeFetch(url, { headers });
        if (!response.ok) {
            throw new Error(`無法連線到 HedgeDoc 伺服器 (狀態碼: ${response.status})`);
        }

        const data = await response.json() as any;
        return {
            username: data.name || 'Guest',
            loggedIn: !data.isGuest,
        };
    }

    async getHistory(): Promise<HistoryNote[]> {
        const url = `${this.getServerUrl()}/history`;
        const headers = await this.getHeaders();

        const response = await this.safeFetch(url, { headers });

        if (response.status === 403 || response.status === 401) {
            throw new Error('未登入，請先設定 Session Cookie');
        }
        if (!response.ok) {
            throw new Error(`取得歷史記錄失敗 (狀態碼: ${response.status})`);
        }

        const data = await response.json() as any;
        if (data && data.history) {
            return data.history as HistoryNote[];
        }
        return [];
    }

    async downloadNote(noteId: string): Promise<string> {
        const url = `${this.getServerUrl()}/${noteId}/download`;
        const headers = await this.getHeaders('text/plain');

        const response = await this.safeFetch(url, { headers });

        if (response.status === 404) {
            throw new Error(`找不到筆記: ${noteId}`);
        }
        if (response.status === 403 || response.status === 401) {
            throw new Error(`沒有權限存取筆記: ${noteId}，請確認已登入`);
        }
        if (!response.ok) {
            throw new Error(`下載失敗 (狀態碼: ${response.status})`);
        }

        return response.text();
    }

    async createNote(content: string, alias?: string): Promise<string> {
        const path = alias ? `/new/${encodeURIComponent(alias)}` : '/new';
        const url = `${this.getServerUrl()}${path}`;
        const headers = await this.getHeaders('text/markdown');

        const response = await this.safeFetch(url, {
            method: 'POST',
            headers,
            body: content,
            redirect: 'manual',
        });

        // HedgeDoc 建立後會 302 重定向到新筆記頁面
        if (response.status === 302 || response.status === 301) {
            const location = response.headers.get('location') || '';
            // location 可能是 /abc123 或完整 URL
            const match = location.match(/\/([a-zA-Z0-9_-]+)\/?$/);
            if (match && match[1] !== 'new') {
                return match[1];
            }
        }

        if (response.ok) {
            const finalUrl = response.url;
            const match = finalUrl.match(/\/([a-zA-Z0-9_-]+)\/?(?:\?.*)?$/);
            if (match && match[1] !== 'new') {
                return match[1];
            }
        }

        throw new Error(`建立筆記失敗 (狀態碼: ${response.status})`);
    }

    /**
     * 更新現有筆記的內容
     * HedgeDoc 1.x 沒有標準 REST API 可更新筆記，
     * 此處使用「刪除歷史記錄項目後重新上傳」的策略，
     * 或直接利用 WebSocket 推送內容（需要 session）。
     * 
     * 實作方案：使用 HedgeDoc 隱藏的 OT API 端點
     */
    async updateNote(noteId: string, content: string): Promise<void> {
        const serverUrl = this.getServerUrl();
        const headers = await this.getHeaders('text/markdown');
        const cookie = await this.authManager.getSessionCookie();

        if (!cookie) {
            throw new Error(
                'HedgeDoc 推送需要登入。請先在設定中配置 Session Cookie。'
            );
        }

        // 嘗試方法 1: 使用 HedgeDoc 1.x 的隱藏 API
        // POST /p/<noteId> 可在某些版本中更新
        try {
            const res = await this.safeFetch(`${serverUrl}/p/${noteId}`, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'text/markdown',
                },
                body: content,
            });

            if (res.ok) return;
        } catch (_) {
            // 方法 1 失敗，繼續嘗試
        }

        // 方法 2: 由於 HedgeDoc 1.x 不提供直接更新 API，
        // 提供開啟瀏覽器的備用方案
        const action = await vscode.window.showWarningMessage(
            `HedgeDoc 1.x 不支援直接 REST API 更新現有筆記內容。\n` +
            `您可以在瀏覽器中開啟筆記後手動更新，或選擇「複製內容到剪貼簿」。`,
            '在瀏覽器開啟',
            '複製 Markdown 到剪貼簿',
            '取消'
        );

        if (action === '在瀏覽器開啟') {
            vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/${noteId}`));
            await vscode.env.clipboard.writeText(content);
            vscode.window.showInformationMessage(
                '✅ 內容已複製到剪貼簿，請在瀏覽器筆記中全選後貼上。'
            );
        } else if (action === '複製 Markdown 到剪貼簿') {
            await vscode.env.clipboard.writeText(content);
            vscode.window.showInformationMessage('✅ Markdown 內容已複製到剪貼簿');
        }

        throw new Error('HANDLED'); // 讓呼叫端知道已處理，不再顯示錯誤
    }

    async deleteNote(noteId: string): Promise<void> {
        const url = `${this.getServerUrl()}/${noteId}`;
        const headers = await this.getHeaders();

        const response = await this.safeFetch(url, {
            method: 'DELETE',
            headers,
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error('沒有刪除權限，請確認已登入且擁有此筆記');
        }
        if (!response.ok) {
            throw new Error(`刪除失敗 (狀態碼: ${response.status})`);
        }
    }

    async getNoteInfo(noteId: string): Promise<NoteInfo> {
        const url = `${this.getServerUrl()}/${noteId}/info`;
        const headers = await this.getHeaders();

        const response = await this.safeFetch(url, { headers });
        if (!response.ok) {
            throw new Error(`取得筆記資訊失敗 (狀態碼: ${response.status})`);
        }

        return response.json() as Promise<NoteInfo>;
    }

    private async safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
        try {
            return await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(15000),
            });
        } catch (err: any) {
            if (err.name === 'AbortError' || err.name === 'TimeoutError') {
                throw new Error('請求逾時，請檢查網路連線或伺服器狀態');
            }
            throw new Error(`網路錯誤: ${err.message}`);
        }
    }
}
