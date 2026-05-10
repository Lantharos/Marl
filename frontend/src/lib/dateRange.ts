export interface DateRangeValue {
	from: string;
	to: string;
}

type ParsedDatePart = DateRangeValue | null;

const months = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

const monthAliases = new Map<string, number>(
	months.flatMap((month, index) => [
		[month, index],
		[month.slice(0, 3), index],
		[month.slice(0, 4), index]
	])
);

export function parseNaturalDateRange(input: string, today = new Date()): DateRangeValue | null {
	const text = normalize(input);
	if (!text) return { from: '', to: '' };
	const base = startOfDay(today);

	if (['any', 'all', 'all time', 'any date', 'clear', 'none'].includes(text)) return { from: '', to: '' };
	if (text === 'today') return oneDay(base);
	if (text === 'yesterday') return oneDay(addDays(base, -1));
	if (text === 'tomorrow') return oneDay(addDays(base, 1));
	if (text === 'this week') return range(startOfWeek(base), endOfWeek(base));
	if (text === 'last week') {
		const start = addDays(startOfWeek(base), -7);
		return range(start, addDays(start, 6));
	}
	if (text === 'this month') return range(startOfMonth(base), endOfMonth(base));
	if (text === 'last month') {
		const start = new Date(base.getFullYear(), base.getMonth() - 1, 1);
		return range(start, endOfMonth(start));
	}
	if (text === 'this year') return range(new Date(base.getFullYear(), 0, 1), new Date(base.getFullYear(), 11, 31));
	if (text === 'last year') return range(new Date(base.getFullYear() - 1, 0, 1), new Date(base.getFullYear() - 1, 11, 31));

	const recent = text.match(/^(?:last|past)\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)$/);
	if (recent) return relativeRange(Number(recent[1]), recent[2], base);

	const since = text.match(/^(?:since|after|from)\s+(.+)$/);
	if (since) {
		const parsed = parseDatePart(since[1], base);
		return parsed ? { from: parsed.from, to: '' } : null;
	}

	const until = text.match(/^(?:until|before|to)\s+(.+)$/);
	if (until) {
		const parsed = parseDatePart(until[1], base);
		return parsed ? { from: '', to: parsed.to } : null;
	}

	const split = splitRange(text);
	if (split) {
		const from = parseDatePart(split[0], base);
		const to = parseDatePart(split[1], base);
		if (!from || !to) return null;
		return orderRange({ from: from.from, to: to.to });
	}

	return parseDatePart(text, base);
}

export function dateInRange(timestamp: string | null | undefined, from: string, to: string) {
	if (!timestamp) return !from && !to;
	const value = timestamp.slice(0, 10);
	if (from && value < from) return false;
	if (to && value > to) return false;
	return true;
}

export function formatDateRangeLabel(from: string, to: string) {
	if (from && to && from === to) return shortDate(from);
	if (from && to) return `${shortDate(from)} - ${shortDate(to)}`;
	if (from) return `Since ${shortDate(from)}`;
	if (to) return `Before ${shortDate(to)}`;
	return 'Any date';
}

export function formatCanonicalRange(from: string, to: string) {
	if (!from && !to) return '';
	if (from && to && from === to) return from;
	if (from && to) return `${from}/${to}`;
	if (from) return `since ${from}`;
	return `before ${to}`;
}

export const dateRangeSuggestions = ['today', 'yesterday', 'last 7 days', 'last 30 days', 'this week', 'last week', 'this month', 'last month'];

function normalize(input: string) {
	return input.trim().toLowerCase().replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ');
}

function splitRange(text: string): [string, string] | null {
	const slash = text.match(/^(.+?)\s*\/\s*(.+)$/);
	if (slash) return [slash[1], slash[2]];
	const dots = text.match(/^(.+?)\s*\.\.\s*(.+)$/);
	if (dots) return [dots[1], dots[2]];
	const word = text.match(/^(.+?)\s+(?:to|through|thru)\s+(.+)$/);
	if (word) return [word[1], word[2]];
	const dash = text.match(/^(.+?)\s+-\s+(.+)$/);
	if (dash) return [dash[1], dash[2]];
	return null;
}

function parseDatePart(text: string, base: Date): ParsedDatePart {
	const value = normalize(text);
	if (!value) return null;

	const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (iso) return validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

	const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
	if (slash) {
		const year = normalizeYear(slash[3], base.getFullYear());
		return validDate(year, Number(slash[1]) - 1, Number(slash[2]));
	}

	const monthFirst = value.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/);
	if (monthFirst) {
		const month = monthAliases.get(monthFirst[1]);
		if (month === undefined) return null;
		return validDate(Number(monthFirst[3] ?? base.getFullYear()), month, Number(monthFirst[2]));
	}

	const dayFirst = value.match(/^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{4}))?$/);
	if (dayFirst) {
		const month = monthAliases.get(dayFirst[2]);
		if (month === undefined) return null;
		return validDate(Number(dayFirst[3] ?? base.getFullYear()), month, Number(dayFirst[1]));
	}

	const monthOnly = value.match(/^([a-z]+)(?:\s+(\d{4}))?$/);
	if (monthOnly) {
		const month = monthAliases.get(monthOnly[1]);
		if (month === undefined) return null;
		const start = new Date(Number(monthOnly[2] ?? base.getFullYear()), month, 1);
		return range(start, endOfMonth(start));
	}

	return null;
}

function relativeRange(amount: number, unit: string, base: Date) {
	const count = Math.max(1, amount);
	if (unit.startsWith('day')) return range(addDays(base, -(count - 1)), base);
	if (unit.startsWith('week')) return range(addDays(base, -(count * 7 - 1)), base);
	if (unit.startsWith('month')) return range(new Date(base.getFullYear(), base.getMonth() - count, base.getDate() + 1), base);
	return range(new Date(base.getFullYear() - count, base.getMonth(), base.getDate() + 1), base);
}

function validDate(year: number, month: number, day: number): ParsedDatePart {
	const date = new Date(year, month, day);
	if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
	return oneDay(date);
}

function normalizeYear(value: string | undefined, fallback: number) {
	if (!value) return fallback;
	const year = Number(value);
	return value.length === 2 ? 2000 + year : year;
}

function oneDay(date: Date): DateRangeValue {
	const value = isoDate(date);
	return { from: value, to: value };
}

function range(from: Date, to: Date): DateRangeValue {
	return orderRange({ from: isoDate(from), to: isoDate(to) });
}

function orderRange(value: DateRangeValue): DateRangeValue {
	if (value.from && value.to && value.from > value.to) return { from: value.to, to: value.from };
	return value;
}

function addDays(date: Date, days: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
	const offset = (date.getDay() + 6) % 7;
	return addDays(date, -offset);
}

function endOfWeek(date: Date) {
	return addDays(startOfWeek(date), 6);
}

function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isoDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shortDate(value: string) {
	const date = new Date(`${value}T00:00:00`);
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
