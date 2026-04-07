import * as vscode from 'vscode';
import * as path from 'path';
import { formatDate, pad2 } from './dates';

export interface NoteInfo {
    hasNote: boolean;
    wordCount: number;
    hasOpenTasks: boolean;
}

export class NoteManager {
    private cfg() {
        return vscode.workspace.getConfiguration('dailyNoteCalendar');
    }

    private root(): string | undefined {
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    }

    /** Full path for a daily note */
    getNotePath(date: Date): string | undefined {
        const r = this.root();
        if (!r) { return undefined; }
        const c = this.cfg();
        const name = formatDate(date, c.get('dateFormat', 'YYYY-MM-DD'));
        const ext = c.get('noteExtension', '.md');
        const folder = c.get('notesFolder', 'daily-notes');
        return path.join(r, folder, name + ext);
    }

    /** Open or create a daily note */
    async openNote(date: Date, beside = false): Promise<void> {
        const r = this.root();
        if (!r) {
            vscode.window.showErrorMessage('Open a folder first.');
            return;
        }
        const c = this.cfg();
        const ext = c.get('noteExtension', '.md');
        const folder = c.get('notesFolder', 'daily-notes');
        const fname = formatDate(date, c.get('dateFormat', 'YYYY-MM-DD')) + ext;
        const dirUri = vscode.Uri.file(path.join(r, folder));

        // Search folder and all subfolders for the matching file
        const fileMap = await this._collectFiles(dirUri, ext);
        const existingUri = fileMap.get(fname);
        if (existingUri) {
            const doc = await vscode.workspace.openTextDocument(existingUri);
            await vscode.window.showTextDocument(doc, beside ? vscode.ViewColumn.Beside : undefined);
            return;
        }

        // Not found — offer to create in the target folder
        if (c.get('confirmBeforeCreate', true)) {
            const label = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const pick = await vscode.window.showInformationMessage(
                `Create daily note for ${label}?`, { modal: true }, 'Create', 'Always Create', 'Cancel'
            );
            if (pick === 'Always Create') {
                await c.update('confirmBeforeCreate', false, vscode.ConfigurationTarget.Global);
            } else if (pick !== 'Create') {
                return;
            }
        }

        const newUri = vscode.Uri.file(path.join(r, folder, fname));
        await this.createNote(newUri, date);
    }

    async createNote(uri: vscode.Uri, date: Date): Promise<void> {
        const c = this.cfg();
        let content = '';

        // Try loading template
        const tplPath = c.get('templatePath', '');
        if (tplPath && this.root()) {
            try {
                const tplUri = vscode.Uri.file(path.join(this.root()!, tplPath));
                const raw = await vscode.workspace.fs.readFile(tplUri);
                content = Buffer.from(raw).toString('utf-8');
                const dateStr = formatDate(date, c.get('dateFormat', 'YYYY-MM-DD'));
                content = content
                    .replace(/\{\{title\}\}/g, dateStr)
                    .replace(/\{\{date\}\}/g, formatDate(date, 'YYYY-MM-DD'))
                    .replace(/\{\{time\}\}/g, formatDate(date, 'HH:mm'));
            } catch {
                // template not found
            }
        }

        if (!content) {
            content = '# ' + formatDate(date, c.get('dateFormat', 'YYYY-MM-DD')) + '\n\n';
        }

        // Ensure directory exists
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
        } catch { /* may already exist */ }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }

    /** Recursively collect all files with the given extension under dirUri.
     *  Returns Map<filename, Uri> — first occurrence wins on name collision. */
    async _collectFiles(dirUri: vscode.Uri, ext: string): Promise<Map<string, vscode.Uri>> {
        const fileMap = new Map<string, vscode.Uri>();
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(dirUri);
        } catch {
            return fileMap;
        }
        for (const [name, type] of entries) {
            if (type === vscode.FileType.Directory) {
                const subMap = await this._collectFiles(vscode.Uri.joinPath(dirUri, name), ext);
                for (const [fname, uri] of subMap) {
                    if (!fileMap.has(fname)) { fileMap.set(fname, uri); }
                }
            } else if (type === vscode.FileType.File && name.endsWith(ext)) {
                fileMap.set(name, vscode.Uri.joinPath(dirUri, name));
            }
        }
        return fileMap;
    }

    /** Scan the notes folder (and subfolders) for a range of dates */
    async scanMonth(year: number, month: number): Promise<Map<string, NoteInfo>> {
        const result = new Map<string, NoteInfo>();
        const r = this.root();
        if (!r) { return result; }
        const c = this.cfg();
        const folder = c.get('notesFolder', 'daily-notes');
        const ext = c.get('noteExtension', '.md');
        const dateFmt = c.get('dateFormat', 'YYYY-MM-DD');
        const wpd = c.get('wordsPerDot', 250);
        const dirUri = vscode.Uri.file(path.join(r, folder));

        // Recursively collect all note files from folder and subfolders
        const fileMap = await this._collectFiles(dirUri, ext);

        // Check dates from 7 days before month to 7 days after
        const start = new Date(year, month, -7);
        const end = new Date(year, month + 1, 7);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const fname = formatDate(d, dateFmt) + ext;
            if (!fileMap.has(fname)) { continue; }
            const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            let wordCount = 0;
            let hasOpenTasks = false;
            try {
                const raw = await vscode.workspace.fs.readFile(fileMap.get(fname)!);
                const text = Buffer.from(raw).toString('utf-8');
                if (wpd > 0) {
                    wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
                }
                hasOpenTasks = /- \[ \]/.test(text);
            } catch { /* skip */ }
            result.set(iso, { hasNote: true, wordCount, hasOpenTasks });
        }
        return result;
    }

    /** Try to extract a date from the active editor's file name */
    getActiveDate(): Date | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { return undefined; }
        const r = this.root();
        if (!r) { return undefined; }
        const c = this.cfg();
        const folder = c.get('notesFolder', 'daily-notes');
        const ext = c.get('noteExtension', '.md');
        const fp = editor.document.uri.fsPath;
        const dir = path.join(r, folder);
        if (!fp.startsWith(dir)) { return undefined; }
        const base = path.basename(fp, ext);
        const d = new Date(base + 'T12:00:00');
        return isNaN(d.getTime()) ? undefined : d;
    }
}
