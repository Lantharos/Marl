export interface DateRangeValue {
	from: string;
	to: string;
}

type ParsedDatePart = DateRangeValue | null;
type PeriodUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const monthAliases = new Map<string, number>(
	months.flatMap((month, index) => [
		[month, index],
		[month.slice(0, 3), index],
		[month.slice(0, 4), index]
	])
);

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const weekdayAliases = new Map<string, number>(
	weekdays.flatMap((day, index) => [
		[day, index],
		[day.slice(0, 3), index]
	])
);

const numberWords = new Map<string, number>(
	Object.entries({
		a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
		eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, several: 3
	})
);

export function parseNaturalDateRange(input: string, today = new Date()): DateRangeValue | null {
	const base = startOfDay(today);
	const value = stripLooseFiller(normalize(input));
	if (!value) return { from: '', to: '' };

	if (isClearValue(value)) return { from: '', to: '' };

	const namedRange = parseNamedRange(value, base);
	if (namedRange) return namedRange;

	const boundary = parseBoundary(value, base);
	if (boundary) return boundary;

	const exact = parseDatePart(value, base);
	if (exact) return exact;

	const relative = parseRelativeRange(value, base);
	if (relative) return relative;

	const explicit = splitRange(value);
	if (explicit) return parseExplicitRange(explicit[0], explicit[1], base);

	const cleaned = cleanDatePart(value);
	return cleaned === value ? null : parseNaturalDateRange(cleaned, base);
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
	if (to) return `Through ${shortDate(to)}`;
	return 'Any date';
}

export function formatCanonicalRange(from: string, to: string) {
	if (!from && !to) return '';
	if (from && to && from === to) return from;
	if (from && to) return `${from}/${to}`;
	if (from) return `since ${from}`;
	return `until ${to}`;
}

export const dateRangeSuggestions = ['today', 'before today', 'last 7 days', 'last 30 days', 'this week', 'last month'];

function isClearValue(value: string) {
	return ['any', 'all', 'all time', 'any date', 'clear', 'none', 'no date', 'no filter', 'everything'].includes(value);
}

function parseNamedRange(text: string, base: Date): DateRangeValue | null {
	const between = text.match(/^between\s+(.+?)\s+(?:and|to|through|thru|until|till)\s+(.+)$/);
	if (between) return parseExplicitRange(between[1], between[2], base);

	const fromTo = text.match(/^from\s+(.+?)\s+(?:to|through|thru|until|till|-)\s+(.+)$/);
	if (fromTo) return parseExplicitRange(fromTo[1], fromTo[2], base);

	return null;
}

function parseExplicitRange(left: string, right: string, base: Date): DateRangeValue | null {
	const from = parseDateish(left, base);
	const to = parseDateish(right, base);
	if (!from || !to) return null;
	return orderRange({ from: from.from, to: to.to });
}

function parseRelativeRange(text: string, base: Date): DateRangeValue | null {
	if (['wtd', 'week to date', 'this week to date'].includes(text)) return range(startOfWeek(base), base);
	if (['mtd', 'month to date', 'this month to date'].includes(text)) return range(startOfMonth(base), base);
	if (['qtd', 'quarter to date', 'this quarter to date'].includes(text)) return range(startOfQuarter(base), base);
	if (['ytd', 'year to date', 'this year to date'].includes(text)) return range(new Date(base.getFullYear(), 0, 1), base);

	const rolling = text.match(new RegExp(`^(?:(?:in|over|during|for)\\s+)?(?:the\\s+)?(?:last|past|previous|recent|preceding)\\s+(.+?)\\s+(${unitPattern()})$`));
	if (rolling) return relativeRange(amountValue(rolling[1]), normalizeUnit(rolling[2]), base);

	const simpleRolling = text.match(/^(?:past|recent|preceding)\s+(day|week|month|quarter|year)$/);
	if (simpleRolling) return relativeRange(1, normalizeUnit(simpleRolling[1]), base);

	const future = text.match(new RegExp(`^(?:(?:in|over|during|for)\\s+)?(?:the\\s+)?(?:next|coming|upcoming)\\s+(.+?)\\s+(${unitPattern()})$`));
	if (future) {
		const count = amountValue(future[1]);
		return range(base, addUnits(base, count, normalizeUnit(future[2])));
	}

	const ago = text.match(new RegExp(`^(?:(?:about|around|roughly|approximately|approx)\\s+)?(.+?)\\s+(${unitPattern()})\\s+ago$`));
	if (ago) return oneDay(addUnits(base, -amountValue(ago[1]), normalizeUnit(ago[2])));

	const older = text.match(new RegExp(`^(?:older than|more than|at least|over|before the last|prior to the last)\\s+(.+?)\\s+(${unitPattern()})(?:\\s+(?:old|ago))?$`));
	if (older) return { from: '', to: isoDate(addUnits(base, -amountValue(older[1]), normalizeUnit(older[2]))) };

	const newer = text.match(new RegExp(`^(?:newer than|less than|under|within|inside|in the last|during the last)\\s+(.+?)\\s+(${unitPattern()})(?:\\s+(?:old|ago))?$`));
	if (newer) return { from: isoDate(addUnits(base, -amountValue(newer[1]), normalizeUnit(newer[2]))), to: isoDate(base) };

	return null;
}

function parseBoundary(text: string, base: Date): DateRangeValue | null {
	const inclusiveBefore = text.match(/^(?:until|til|till|up to|upto|up until|through|thru|on or before|before or on|no later than|not after|by|ending|ending on|end(?:ing)? at|to)\s+(.+)$/);
	if (inclusiveBefore) return boundaryBefore(inclusiveBefore[1], base, true);

	const exclusiveBefore = text.match(/^(?:before|prior to|prior|pre|earlier than|older than|less recent than)\s+(.+)$/);
	if (exclusiveBefore) return boundaryBefore(exclusiveBefore[1], base, false);

	const inclusiveAfter = text.match(/^(?:since|from|starting|starting on|start(?:ing)? at|on or after|after or on|no earlier than|not before|as of)\s+(.+)$/);
	if (inclusiveAfter) return boundaryAfter(inclusiveAfter[1], base, true);

	const exclusiveAfter = text.match(/^(?:after|later than|newer than|more recent than)\s+(.+)$/);
	if (exclusiveAfter) return boundaryAfter(exclusiveAfter[1], base, false);

	const trailingBefore = text.match(/^(.+?)\s+(?:or earlier|and earlier|or before|and before)$/);
	if (trailingBefore) return boundaryBefore(trailingBefore[1], base, true);

	const trailingAfter = text.match(/^(.+?)\s+(?:or later|and later|or after|and after|onward|onwards|forward|forwards)$/);
	if (trailingAfter) return boundaryAfter(trailingAfter[1], base, true);

	return null;
}

function boundaryBefore(text: string, base: Date, inclusive: boolean): DateRangeValue | null {
	const parsed = parseDateish(text, base);
	if (!parsed?.from || !parsed.to) return null;
	const end = inclusive ? parsed.to : isoDate(addDays(parseIsoDate(parsed.from), -1));
	return { from: '', to: end };
}

function boundaryAfter(text: string, base: Date, inclusive: boolean): DateRangeValue | null {
	const parsed = parseDateish(text, base);
	if (!parsed?.from || !parsed.to) return null;
	const start = inclusive ? parsed.from : isoDate(addDays(parseIsoDate(parsed.to), 1));
	return { from: start, to: '' };
}

function periodRange(period: PeriodUnit | 'weekend', modifier: string, base: Date): DateRangeValue | null {
	if (period === 'day') {
		const offset = modifier === 'last' || modifier === 'previous' ? -1 : modifier === 'next' ? 1 : 0;
		return oneDay(addDays(base, offset));
	}

	if (period === 'week') {
		const start = addDays(startOfWeek(base), periodOffset(modifier, 7));
		return range(start, addDays(start, 6));
	}

	if (period === 'weekend') {
		const start = addDays(startOfWeek(base), 5 + periodOffset(modifier, 7));
		return range(start, addDays(start, 1));
	}

	if (period === 'month') {
		const start = new Date(base.getFullYear(), base.getMonth() + periodOffset(modifier, 1), 1);
		return range(start, endOfMonth(start));
	}

	if (period === 'quarter') {
		const start = addQuarters(startOfQuarter(base), modifier === 'last' || modifier === 'previous' ? -1 : modifier === 'next' ? 1 : 0);
		return range(start, endOfQuarter(start));
	}

	if (period === 'year') {
		const year = base.getFullYear() + (modifier === 'last' || modifier === 'previous' ? -1 : modifier === 'next' ? 1 : 0);
		return range(new Date(year, 0, 1), new Date(year, 11, 31));
	}

	return null;
}

function normalize(input: string) {
	return input
		.trim()
		.toLowerCase()
		.replace(/[\u2013\u2014]/g, ' - ')
		.replace(/[.,?]+$/g, '')
		.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, '$1')
		.replace(/\s+/g, ' ');
}

function stripLooseFiller(text: string) {
	return text
		.replace(/^(?:please\s+)?(?:show me|show|find|get|filter by|filter|only|all)\s+/, '')
		.replace(/^(?:created|updated|opened|closed|published|merged|saved|changed|released|activity|date|dates)\s+(?:on|at|in|for|from)?\s*/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function splitRange(text: string): [string, string] | null {
	const dots = text.match(/^(.+?)\s*\.\.\s*(.+)$/);
	if (dots) return [dots[1], dots[2]];
	const word = text.match(/^(.+?)\s+(?:to|through|thru|until|till)\s+(.+)$/);
	if (word) return [word[1], word[2]];
	const dash = text.match(/^(.+?)\s+-\s+(.+)$/);
	if (dash) return [dash[1], dash[2]];
	if (!looksLikeSlashDate(text)) {
		const slash = text.match(/^(.+?)\s*\/\s*(.+)$/);
		if (slash) return [slash[1], slash[2]];
	}
	return null;
}

function parseDateish(text: string, base: Date): ParsedDatePart {
	const value = stripLooseFiller(cleanDatePart(text));
	return parseDatePart(value, base) ?? parseRelativeRange(value, base);
}

function parseDatePart(text: string, base: Date): ParsedDatePart {
	const value = cleanDatePart(text);
	if (!value) return null;

	if (['today', 'now', 'right now', 'current', 'current day', 'current date', 'this date'].includes(value)) return oneDay(base);
	if (['yesterday', 'previous day'].includes(value)) return oneDay(addDays(base, -1));
	if (['tomorrow', 'next day'].includes(value)) return oneDay(addDays(base, 1));
	if (value === 'day before today') return oneDay(addDays(base, -1));
	if (['day before yesterday', 'the day before yesterday'].includes(value)) return oneDay(addDays(base, -2));
	if (['day after tomorrow', 'the day after tomorrow'].includes(value)) return oneDay(addDays(base, 2));
	if (value === 'weekend') return periodRange('weekend', 'this', base);

	const period = value.match(/^(this|current|last|previous|prev|next|coming|upcoming)\s+(day|week|weekend|month|quarter|year)$/);
	if (period) return periodRange(period[2] as PeriodUnit | 'weekend', normalizeModifier(period[1]), base);

	const weekday = value.match(/^(?:(this|current|last|previous|prev|next|coming|upcoming)\s+)?([a-z]+)$/);
	if (weekday) {
		const day = weekdayAliases.get(weekday[2]);
		if (day !== undefined) return weekdayRange(day, normalizeModifier(weekday[1] ?? 'this'), base);
	}

	const weekOf = value.match(/^week\s+(?:of|starting|beginning)\s+(.+)$/);
	if (weekOf) {
		const parsed = parseDateish(weekOf[1], base);
		if (!parsed?.from) return null;
		const start = startOfWeek(parseIsoDate(parsed.from));
		return range(start, addDays(start, 6));
	}

	const monthOf = value.match(/^month\s+of\s+(.+)$/);
	if (monthOf) return parseDatePart(monthOf[1], base);

	const quarter = parseQuarter(value, base);
	if (quarter) return quarter;

	const yearOnly = value.match(/^(?:year\s+)?(\d{4})$/);
	if (yearOnly) {
		const year = Number(yearOnly[1]);
		return range(new Date(year, 0, 1), new Date(year, 11, 31));
	}

	const yearMonth = value.match(/^(\d{4})[-/.](\d{1,2})$/);
	if (yearMonth) {
		const start = new Date(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1);
		return range(start, endOfMonth(start));
	}

	const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (iso) return validDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

	const separated = value.match(/^(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?$/);
	if (separated) {
		const year = normalizeYear(separated[3], base.getFullYear());
		return validDate(year, Number(separated[1]) - 1, Number(separated[2]));
	}

	const monthFirst = value.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/);
	if (monthFirst) {
		const month = monthAliases.get(monthFirst[1]);
		if (month === undefined) return null;
		return validDate(normalizeYear(monthFirst[3], base.getFullYear()), month, Number(monthFirst[2]));
	}

	const dayFirst = value.match(/^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{2,4}))?$/);
	if (dayFirst) {
		const month = monthAliases.get(dayFirst[2]);
		if (month === undefined) return null;
		return validDate(normalizeYear(dayFirst[3], base.getFullYear()), month, Number(dayFirst[1]));
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

function parseQuarter(value: string, base: Date): ParsedDatePart {
	const numeric = value.match(/^(?:(\d{4})\s+)?(?:q|qtr|quarter)\s*([1-4])(?:\s+of)?(?:\s+(\d{4}))?$/);
	if (numeric) return quarterRange(Number(numeric[1] ?? numeric[3] ?? base.getFullYear()), Number(numeric[2]));

	const flipped = value.match(/^(\d{4})\s+q([1-4])$/);
	if (flipped) return quarterRange(Number(flipped[1]), Number(flipped[2]));

	const ordinal = value.match(/^(first|second|third|fourth)\s+quarter(?:\s+of)?(?:\s+(\d{4}))?$/);
	if (ordinal) return quarterRange(Number(ordinal[2] ?? base.getFullYear()), ['first', 'second', 'third', 'fourth'].indexOf(ordinal[1]) + 1);

	return null;
}

function quarterRange(year: number, quarter: number) {
	const start = new Date(year, (quarter - 1) * 3, 1);
	return range(start, endOfQuarter(start));
}

function cleanDatePart(text: string) {
	return normalize(text)
		.replace(/^(?:on|at|for|during|in|the|date|day of)\s+/, '')
		.replace(/^(\d{1,2})\s+of\s+([a-z]+)(.*)$/, '$1 $2$3')
		.replace(/^([a-z]+)\s+of\s+(\d{4})$/, '$1 $2')
		.replace(/\s+(?:date|day)$/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function relativeRange(amount: number, unit: PeriodUnit, base: Date) {
	const count = Math.max(1, amount);
	if (unit === 'day') return range(addDays(base, -(count - 1)), base);
	if (unit === 'week') return range(addDays(base, -(count * 7 - 1)), base);
	if (unit === 'month') return range(addDays(addUnits(base, -count, unit), 1), base);
	if (unit === 'quarter') return range(addDays(addUnits(base, -count, unit), 1), base);
	return range(addDays(addUnits(base, -count, unit), 1), base);
}

function amountValue(value: string) {
	const cleaned = value.replace(/-/g, ' ').replace(/^(?:about|around|roughly|approximately|approx|the)\s+/, '').trim();
	if (/^\d+$/.test(cleaned)) return Number(cleaned);
	if (cleaned.includes('couple')) return 2;
	if (cleaned.includes('few')) return 3;
	if (cleaned.includes('several')) return 3;
	const exact = numberWords.get(cleaned);
	if (exact) return exact;
	return cleaned.split(/\s+/).reduce((total, word) => total + (numberWords.get(word) ?? 0), 0) || 1;
}

function normalizeUnit(value: string): PeriodUnit {
	if (value.startsWith('week') || value.startsWith('wk')) return 'week';
	if (value.startsWith('month') || value.startsWith('mo')) return 'month';
	if (value.startsWith('quarter') || value.startsWith('qtr')) return 'quarter';
	if (value.startsWith('year') || value.startsWith('yr')) return 'year';
	return 'day';
}

function unitPattern() {
	return 'day|days|week|weeks|wk|wks|month|months|mo|mos|quarter|quarters|qtr|qtrs|year|years|yr|yrs';
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

function looksLikeSlashDate(text: string) {
	return /^\d{1,4}\/\d{1,2}(?:\/\d{1,4})?$/.test(text);
}

function addDays(date: Date, days: number) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addUnits(date: Date, amount: number, unit: PeriodUnit) {
	if (unit === 'day') return addDays(date, amount);
	if (unit === 'week') return addDays(date, amount * 7);
	if (unit === 'month') return addMonths(date, amount);
	if (unit === 'quarter') return addMonths(date, amount * 3);
	return new Date(date.getFullYear() + amount, date.getMonth(), Math.min(date.getDate(), daysInMonth(date.getFullYear() + amount, date.getMonth())));
}

function addMonths(date: Date, monthsToAdd: number) {
	const first = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
	return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), daysInMonth(first.getFullYear(), first.getMonth())));
}

function addQuarters(date: Date, quarters: number) {
	return addMonths(date, quarters * 3);
}

function startOfDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
	const offset = (date.getDay() + 6) % 7;
	return addDays(date, -offset);
}

function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfQuarter(date: Date) {
	return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function endOfQuarter(date: Date) {
	const start = startOfQuarter(date);
	return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

function daysInMonth(year: number, month: number) {
	return new Date(year, month + 1, 0).getDate();
}

function periodOffset(modifier: string, size: number) {
	if (modifier === 'last' || modifier === 'previous') return -size;
	if (modifier === 'next') return size;
	return 0;
}

function normalizeModifier(modifier: string) {
	if (modifier === 'prev') return 'previous';
	if (modifier === 'current') return 'this';
	if (modifier === 'coming' || modifier === 'upcoming') return 'next';
	return modifier;
}

function weekdayRange(day: number, modifier: string, base: Date) {
	const start = addDays(startOfWeek(base), day === 0 ? 6 : day - 1);
	const offset = modifier === 'last' || modifier === 'previous' ? -7 : modifier === 'next' ? 7 : 0;
	return oneDay(addDays(start, offset));
}

function parseIsoDate(value: string) {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(year, month - 1, day);
}

function isoDate(date: Date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shortDate(value: string) {
	const date = new Date(`${value}T00:00:00`);
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
