// How many app opens per hour the run wants at a given moment: the population's daily volume,
// shaped by the hour-of-day curve and weekday, times the run's multiplier, stages and ramp-up.
import { type Config, parseDuration, WEEKDAYS, type Weekday } from "./config.js";

export interface RateNow {
    /** App opens per (real) hour wanted right now. */
    visitsPerHour: number;
    /** Product of the run's multiplier, stage and ramp-up. */
    multiplier: number;
    /** The simulated local time the curve was read at. */
    localHour: number;
    weekday: Weekday;
    stage: number | null;
}

export class Schedule {
    private readonly dailyVisits: number;
    private readonly curve: number[];
    private readonly stageEnds: number[];
    private readonly rampS: number;
    private readonly parts: Intl.DateTimeFormat;

    constructor(private readonly c: Config, private readonly startedAt: number) {
        const p = c.population;
        this.dailyVisits = c.users.count * p.dailyActiveShare * p.visitsPerActiveUser;
        const total = p.hourlyCurve.reduce((a, b) => a + b, 0);
        this.curve = p.hourlyCurve.map((x) => x / total);
        let end = 0;
        this.stageEnds = c.load.stages.map((s) => (end += parseDuration(s.duration)));
        this.rampS = c.load.stages.length ? 0 : parseDuration(c.load.rampUp);
        this.parts = new Intl.DateTimeFormat("en-US", {
            timeZone: p.timezone,
            hourCycle: "h23",
            weekday: "short",
            hour: "numeric",
            minute: "numeric",
        });
    }

    /** Simulated wall-clock: runs `clockSpeed` times faster than real time from the start. */
    simTime(now: number): number {
        return this.startedAt + (now - this.startedAt) * this.c.load.clockSpeed;
    }

    localTime(now: number): { hour: number; weekday: Weekday } {
        let hour = 0;
        let minute = 0;
        let weekday: Weekday = "mon";
        for (const part of this.parts.formatToParts(this.simTime(now))) {
            if (part.type === "hour") hour = Number(part.value);
            else if (part.type === "minute") minute = Number(part.value);
            else if (part.type === "weekday") weekday = part.value.toLowerCase().slice(0, 3) as Weekday;
        }
        return { hour: hour + minute / 60, weekday };
    }

    /** Stage multiplier at `elapsedS`: linear from the previous stage's end value (0 before the first). */
    stageAt(elapsedS: number): { multiplier: number; stage: number | null } {
        const stages = this.c.load.stages;
        if (!stages.length) return { multiplier: 1, stage: null };
        let from = 0;
        let startS = 0;
        for (let i = 0; i < stages.length; i++) {
            const endS = this.stageEnds[i];
            if (elapsedS < endS) {
                const len = endS - startS;
                const f = len > 0 ? (elapsedS - startS) / len : 1;
                return { multiplier: from + (stages[i].multiplier - from) * f, stage: i };
            }
            from = stages[i].multiplier;
            startS = endS;
        }
        return { multiplier: from, stage: stages.length - 1 };
    }

    /** Share of a day's opens that happen in the hour around local `hour` (linear between hours). */
    curveAt(hour: number): number {
        const h0 = Math.floor(hour) % 24;
        const f = hour - Math.floor(hour);
        return this.curve[h0] * (1 - f) + this.curve[(h0 + 1) % 24] * f;
    }

    at(now: number): RateNow {
        const elapsedS = (now - this.startedAt) / 1000;
        const { hour, weekday } = this.localTime(now);
        const { multiplier: stageMul, stage } = this.stageAt(elapsedS);
        const ramp = this.rampS > 0 ? Math.min(1, elapsedS / this.rampS) : 1;
        const multiplier = this.c.load.multiplier * stageMul * ramp;
        const dayFactor = this.c.population.weekdayFactors[weekday] ?? 1;
        // A day's opens squeezed into 1/clockSpeed of the time arrive clockSpeed times faster.
        const visitsPerHour = this.dailyVisits * this.curveAt(hour) * dayFactor * multiplier * this.c.load.clockSpeed;
        return { visitsPerHour, multiplier, localHour: hour, weekday, stage };
    }

    /** Busiest hour of an average week at multiplier 1, for the plan printout. */
    peakVisitsPerHour(): number {
        const maxDay = Math.max(...WEEKDAYS.map((d) => this.c.population.weekdayFactors[d]));
        return this.dailyVisits * Math.max(...this.curve) * maxDay * this.c.load.multiplier;
    }

    get visitsPerDay(): number {
        return this.dailyVisits * this.c.load.multiplier;
    }
}

/** A Poisson-distributed count with mean `mean` (inversion for small means, normal above). */
export function poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian()));
    const limit = Math.exp(-mean);
    let k = 0;
    let p = Math.random();
    while (p > limit) {
        k++;
        p *= Math.random();
    }
    return k;
}

function gaussian(): number {
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
