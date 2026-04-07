"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const calendarView_1 = require("./calendarView");
const noteManager_1 = require("./noteManager");
let refreshTimer;
function activate(context) {
    console.log('[DailyNoteCalendar] Activating...');
    const notes = new noteManager_1.NoteManager();
    const provider = new calendarView_1.CalendarViewProvider(context.extensionUri, notes);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(calendarView_1.CalendarViewProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } }));
    context.subscriptions.push(vscode.commands.registerCommand('dailyNoteCalendar.openTodayNote', () => {
        notes.openNote(new Date());
    }));
    context.subscriptions.push(vscode.commands.registerCommand('dailyNoteCalendar.revealActiveNote', () => {
        provider.revealActiveNote();
    }));
    // Debounced refresh on file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
    const scheduleRefresh = () => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => provider.refresh(), 500);
    };
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
    watcher.onDidChange(scheduleRefresh);
    context.subscriptions.push(watcher);
    // Config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('dailyNoteCalendar')) {
            provider.refresh();
        }
    }));
    console.log('[DailyNoteCalendar] Activated.');
}
function deactivate() {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
}
//# sourceMappingURL=extension.js.map