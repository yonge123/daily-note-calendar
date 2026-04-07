const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export function pad2(n: number): string {
    return n < 10 ? '0' + n : String(n);
}

export function toISO(d: Date): string {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

export function getMonthName(month: number): string {
    return MONTH_NAMES[month];
}

export function isoWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function isoWeekYear(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    return d.getUTCFullYear();
}

/**
 * Format date string. Supported tokens:
 * YYYY, MM, DD, MMMM, GGGG, WW, and [literal] escaping.
 */
export function formatDate(date: Date, fmt: string): string {
    const map: Record<string, string> = {
        'YYYY': String(date.getFullYear()),
        'MM': pad2(date.getMonth() + 1),
        'DD': pad2(date.getDate()),
        'MMMM': MONTH_NAMES[date.getMonth()],
        'GGGG': String(isoWeekYear(date)),
        'WW': pad2(isoWeek(date)),
        'HH': pad2(date.getHours()),
        'mm': pad2(date.getMinutes()),
    };
    let result = '';
    let i = 0;
    while (i < fmt.length) {
        if (fmt[i] === '[') {
            const end = fmt.indexOf(']', i + 1);
            if (end !== -1) {
                result += fmt.substring(i + 1, end);
                i = end + 1;
                continue;
            }
        }
        let matched = false;
        for (let len = 4; len >= 2; len--) {
            const tok = fmt.substring(i, i + len);
            if (map[tok] !== undefined) {
                result += map[tok];
                i += len;
                matched = true;
                break;
            }
        }
        if (!matched) {
            result += fmt[i];
            i++;
        }
    }
    return result;
}

/**
 * Build a 6-row calendar grid (42 days) for the given month.
 */
export function calendarGrid(year: number, month: number, mondayStart: boolean): Date[] {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    let startDow = first.getDay(); // 0=Sun
    if (mondayStart) {
        startDow = startDow === 0 ? 6 : startDow - 1;
    }
    const days: Date[] = [];
    // Padding from previous month
    for (let i = startDow - 1; i >= 0; i--) {
        days.push(new Date(year, month, -i));
    }
    // Current month
    for (let d = 1; d <= last.getDate(); d++) {
        days.push(new Date(year, month, d));
    }
    // Padding to fill 6 rows
    while (days.length < 42) {
        const prev = days[days.length - 1];
        const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
        days.push(next);
    }
    return days;
}

export function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}
