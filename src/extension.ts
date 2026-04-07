import * as vscode from 'vscode';
import { CalendarViewProvider } from './calendarView';
import { NoteManager } from './noteManager';

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext): void {
    console.log('[DailyNoteCalendar] Activating...');

    const notes = new NoteManager();
    const provider = new CalendarViewProvider(context.extensionUri, notes);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CalendarViewProvider.viewType,
            provider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dailyNoteCalendar.openTodayNote', () => {
            notes.openNote(new Date());
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('dailyNoteCalendar.revealActiveNote', () => {
            provider.revealActiveNote();
        })
    );

    // Debounced refresh on file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    const scheduleRefresh = () => {
        if (refreshTimer) { clearTimeout(refreshTimer); }
        refreshTimer = setTimeout(() => provider.refresh(), 500);
    };
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
    watcher.onDidChange(scheduleRefresh);
    context.subscriptions.push(watcher);

    // Config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('dailyNoteCalendar')) {
                provider.refresh();
            }
        })
    );

    console.log('[DailyNoteCalendar] Activated.');
}

export function deactivate(): void {
    if (refreshTimer) { clearTimeout(refreshTimer); }
}
