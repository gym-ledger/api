import { pg } from "../infrastructure/postgres/index.js";

/**
 * Legacy IANA names → their current canonical names.
 *
 * Browsers (Chrome/ICU) still report CLDR's older IDs from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` — e.g. "Asia/Calcutta" —
 * but Postgres built against system tzdata without the `backward` links
 * (Debian's tzdata-legacy split) rejects them in `AT TIME ZONE`.
 */
const LEGACY_TIMEZONE_ALIASES: Record<string, string> = {
    "Africa/Asmera": "Africa/Asmara",
    "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    "America/Catamarca": "America/Argentina/Catamarca",
    "America/Coral_Harbour": "America/Atikokan",
    "America/Cordoba": "America/Argentina/Cordoba",
    "America/Fort_Wayne": "America/Indiana/Indianapolis",
    "America/Godthab": "America/Nuuk",
    "America/Indianapolis": "America/Indiana/Indianapolis",
    "America/Jujuy": "America/Argentina/Jujuy",
    "America/Louisville": "America/Kentucky/Louisville",
    "America/Mendoza": "America/Argentina/Mendoza",
    "America/Montreal": "America/Toronto",
    "America/Santa_Isabel": "America/Tijuana",
    "Asia/Ashkhabad": "Asia/Ashgabat",
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Choibalsan": "Asia/Ulaanbaatar",
    "Asia/Chongqing": "Asia/Shanghai",
    "Asia/Chungking": "Asia/Shanghai",
    "Asia/Dacca": "Asia/Dhaka",
    "Asia/Harbin": "Asia/Shanghai",
    "Asia/Istanbul": "Europe/Istanbul",
    "Asia/Kashgar": "Asia/Urumqi",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Macao": "Asia/Macau",
    "Asia/Rangoon": "Asia/Yangon",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Asia/Tel_Aviv": "Asia/Jerusalem",
    "Asia/Thimbu": "Asia/Thimphu",
    "Asia/Ujung_Pandang": "Asia/Makassar",
    "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
    "Atlantic/Faeroe": "Atlantic/Faroe",
    "Australia/Currie": "Australia/Hobart",
    "Europe/Belfast": "Europe/London",
    "Europe/Kiev": "Europe/Kyiv",
    "Europe/Uzhgorod": "Europe/Kyiv",
    "Europe/Zaporozhye": "Europe/Kyiv",
    "Pacific/Enderbury": "Pacific/Kanton",
    "Pacific/Ponape": "Pacific/Pohnpei",
    "Pacific/Samoa": "Pacific/Pago_Pago",
    "Pacific/Truk": "Pacific/Chuuk",
};

/** lower-cased name → Postgres's own spelling, loaded once from pg_timezone_names. */
let postgresTimezones: Map<string, string> | null = null;

const loadPostgresTimezones = async (): Promise<Map<string, string>> => {
    if (!postgresTimezones) {
        const result = await pg.query("SELECT name FROM pg_timezone_names");
        postgresTimezones = new Map(
            result.rows.map((row) => [(row.name as string).toLowerCase(), row.name as string]),
        );
    }
    return postgresTimezones;
}

/** Whether JS (Intl / Luxon) can use this zone. */
const isIntlTimezone = (timezone: string): boolean => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        return true;
    } catch {
        return false;
    }
}

/**
 * Returns the zone name to store/use for `timezone` — legacy aliases mapped to
 * their current name — or null if neither Postgres nor Intl can use it.
 * Postgres is checked against its actual zone list so a value that passes here
 * can never break an `AT TIME ZONE` query.
 */
export const resolveSupportedTimezone = async (timezone: unknown): Promise<string | null> => {
    if (typeof timezone !== "string") {
        return null;
    }
    const trimmed = timezone.trim();
    if (!trimmed) {
        return null;
    }
    const zones = await loadPostgresTimezones();
    // Prefer the canonical name; fall back to the original if this Postgres
    // happens to know the alias but not the newer name (older tzdata).
    const candidates = [LEGACY_TIMEZONE_ALIASES[trimmed], trimmed].filter(Boolean) as string[];
    for (const candidate of candidates) {
        const pgName = zones.get(candidate.toLowerCase());
        if (pgName && isIntlTimezone(pgName)) {
            return pgName;
        }
    }
    return null;
}
