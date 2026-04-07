import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { calendarGrid, getMonthName, isoWeek, sameDay, toISO } from './dates';
import { NoteManager } from './noteManager';

export class CalendarViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'dailyNoteCalendar.calendarView';

    private _view?: vscode.WebviewView;
    private _year: number;
    private _month: number;

    constructor(
        private readonly _extUri: vscode.Uri,
        private readonly _notes: NoteManager
    ) {
        const now = new Date();
        this._year = now.getFullYear();
        this._month = now.getMonth();
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _ctx: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        // Load HTML from file
        const htmlPath = path.join(this._extUri.fsPath, 'media', 'calendar.html');
        let html: string;
        try {
            html = fs.readFileSync(htmlPath, 'utf-8');
        } catch (err) {
            html = `<html><body><p>Error loading calendar: ${err}</p></body></html>`;
        }
        webviewView.webview.html = html;

        // Listen for messages from the webview
        webviewView.webview.onDidReceiveMessage(
            (msg) => this._onMessage(msg),
            undefined
        );
    }

    refresh(): void {
        this._sendUpdate();
    }

    revealActiveNote(): void {
        const d = this._notes.getActiveDate();
        if (d) {
            this._year = d.getFullYear();
            this._month = d.getMonth();
            this._sendUpdate();
        }
    }

    private async _onMessage(msg: any): Promise<void> {
        try {
            switch (msg.command) {
                case 'ready':
                    this._sendUpdate();
                    break;
                case 'navigate':
                    if (msg.direction === 'prev') {
                        this._month--;
                        if (this._month < 0) { this._month = 11; this._year--; }
                    } else if (msg.direction === 'next') {
                        this._month++;
                        if (this._month > 11) { this._month = 0; this._year++; }
                    } else if (msg.direction === 'today') {
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
        } catch (err: any) {
            console.error('[DailyNoteCalendar]', err);
            vscode.window.showErrorMessage('Calendar error: ' + (err?.message || err));
        }
    }

    private async _sendUpdate(): Promise<void> {
        if (!this._view) { return; }

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
        const grid = calendarGrid(this._year, this._month, mondayStart);
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
                const iso = toISO(d);
                const info = infoMap.get(iso);
                return {
                    date: iso,
                    day: d.getDate(),
                    isCurrentMonth: d.getMonth() === this._month,
                    isToday: sameDay(d, today),
                    isWeekend: d.getDay() === 0 || d.getDay() === 6,
                    hasNote: !!info?.hasNote,
                    hasOpenTasks: !!info?.hasOpenTasks,
                    wordCount: info?.wordCount || 0,
                    dots: info ? Math.max(1, wpd > 0 ? Math.min(5, Math.floor(info.wordCount / wpd)) : 1) : 0,
                };
            });

            weeks.push({
                weekNum: isoWeek(thu),
                weekDate: slice[0].toISOString(),
                days
            });
        }

        this._view.webview.postMessage({
            command: 'update',
            year: this._year,
            month: this._month,
            monthName: getMonthName(this._month),
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
