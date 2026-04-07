"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarViewProvider = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const dates_1 = require("./dates");
class CalendarViewProvider {
    constructor(_extUri, _notes) {
        this._extUri = _extUri;
        this._notes = _notes;
        const now = new Date();
        this._year = now.getFullYear();
        this._month = now.getMonth();
    }
    resolveWebviewView(webviewView, _ctx, _token) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        // Load HTML from file
        const htmlPath = path.join(this._extUri.fsPath, 'media', 'calendar.html');
        let html;
        try {
            html = fs.readFileSync(htmlPath, 'utf-8');
        }
        catch (err) {
            html = `<html><body><p>Error loading calendar: ${err}</p></body></html>`;
        }
        webviewView.webview.html = html;
        // Listen for messages from the webview
        webviewView.webview.onDidReceiveMessage((msg) => this._onMessage(msg), undefined);
    }
    refresh() {
        this._sendUpdate();
    }
    revealActiveNote() {
        const d = this._notes.getActiveDate();
        if (d) {
            this._year = d.getFullYear();
            this._month = d.getMonth();
            this._sendUpdate();
        }
    }
    async _onMessage(msg) {
        try {
            switch (msg.command) {
                case 'ready':
                    this._sendUpdate();
                    break;
                case 'navigate':
                    if (msg.direction === 'prev') {
                        this._month--;
                        if (this._month < 0) {
                            this._month = 11;
                            this._year--;
                        }
                    }
                    else if (msg.direction === 'next') {
                        this._month++;
                        if (this._month > 11) {
                            this._month = 0;
                            this._year++;
                        }
                    }
                    else if (msg.direction === 'today') {
                        const now = new Date();
                        this._year = now.getFullYear();
                        this._month = now.getMonth();
                    }
                    this._sendUpdate();
                    break;
                case 'openDailyNote': {
                    const d = new Date(msg.date + 'T12:00:00');
                    await this._notes.openNote(d, !!msg.split);
                    this._sendUpdate();
                    break;
                }
                case 'openWeeklyNote':
                    vscode.window.showInformationMessage('Weekly notes coming soon!');
                    break;
            }
        }
        catch (err) {
            console.error('[DailyNoteCalendar]', err);
            vscode.window.showErrorMessage('Calendar error: ' + (err?.message || err));
        }
    }
    async _sendUpdate() {
        if (!this._view) {
            return;
        }
        const cfg = vscode.workspace.getConfiguration('dailyNoteCalendar');
        const mondayStart = cfg.get('startWeekOn', 'monday') === 'monday';
        const showWk = cfg.get('showWeekNumbers', false);
        const wpd = cfg.get('wordsPerDot', 250);
        const dayHeaders = mondayStart
            ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
            : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        // Scan notes
        const infoMap = await this._notes.scanMonth(this._year, this._month);
        // Build grid
        const grid = (0, dates_1.calendarGrid)(this._year, this._month, mondayStart);
        const today = new Date();
        const weeks = [];
        for (let i = 0; i < grid.length; i += 7) {
            const slice = grid.slice(i, i + 7);
            // Week number from the Thursday of this week
            const thu = new Date(slice[0]);
            const dow = thu.getDay();
            const offset = mondayStart ? (4 - (dow === 0 ? 7 : dow)) : (4 - dow);
            thu.setDate(thu.getDate() + offset);
            const days = slice.map(d => {
                const iso = (0, dates_1.toISO)(d);
                const info = infoMap.get(iso);
                return {
                    date: iso,
                    day: d.getDate(),
                    isCurrentMonth: d.getMonth() === this._month,
                    isToday: (0, dates_1.sameDay)(d, today),
                    isWeekend: d.getDay() === 0 || d.getDay() === 6,
                    hasNote: !!info?.hasNote,
                    hasOpenTasks: !!info?.hasOpenTasks,
                    wordCount: info?.wordCount || 0,
                    dots: info ? Math.max(1, wpd > 0 ? Math.min(5, Math.floor(info.wordCount / wpd)) : 1) : 0,
                };
            });
            weeks.push({
                weekNum: (0, dates_1.isoWeek)(thu),
                weekDate: slice[0].toISOString(),
                days
            });
        }
        this._view.webview.postMessage({
            command: 'update',
            year: this._year,
            month: this._month,
            monthName: (0, dates_1.getMonthName)(this._month),
            dayHeaders,
            weeks,
            showWeekNumbers: showWk,
            weeklyEnabled: false,
            wordsPerDot: wpd,
            colors: {
                month: cfg.get('colorMonth', ''),
                year: cfg.get('colorYear', ''),
                weekNumber: cfg.get('colorWeekNumber', ''),
                date: cfg.get('colorDate', ''),
                font: cfg.get('fontFamily', ''),
            },
        });
    }
}
exports.CalendarViewProvider = CalendarViewProvider;
CalendarViewProvider.viewType = 'dailyNoteCalendar.calendarView';
//# sourceMappingURL=calendarView.js.map