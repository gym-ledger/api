import { strict as assert } from "node:assert";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig, parseConfig, parseDuration } from "./config.js";
import { Schedule } from "./schedule.js";
import { Histogram } from "./stats.js";

const base = { target: { apiUrl: "https://api.example.com/api/v1" } };

test("durations", () => {
    assert.equal(parseDuration("90s"), 90);
    assert.equal(parseDuration("1h30m"), 5400);
    assert.equal(parseDuration("2d"), 172_800);
    assert.equal(parseDuration("forever"), Infinity);
    assert.throws(() => parseDuration("soon"));
});

test("config: unknown keys and bad values are reported together", () => {
    assert.throws(() => parseConfig({ ...base, users: { cuont: 5 }, logins: { typoRate: 2 } }), (err: Error) =>
        /users\.cuont is not a setting/.test(err.message) && /2 problems/.test(err.message));
    assert.throws(() => parseConfig({}), /target\.apiUrl is required/);
});

test("config: duration comes from the stages unless set", () => {
    const stages = [{ duration: "1m", multiplier: 2 }, { duration: "2m", multiplier: 2 }];
    assert.equal(parseConfig({ ...base, load: { stages } }).durationS, 180);
    assert.equal(parseConfig({ ...base, load: { stages, duration: "forever" } }).durationS, Infinity);
});

test("config: the hash ignores report settings but not the load", () => {
    const a = parseConfig(base).hash;
    assert.equal(parseConfig({ ...base, report: { tickSeconds: 30 } }).hash, a);
    assert.notEqual(parseConfig({ ...base, load: { multiplier: 2 } }).hash, a);
});

test("every preset parses", () => {
    const dir = join(import.meta.dirname, "..", "configs");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) loadConfig(join(dir, f));
});

test("stages ramp linearly from 0, then hold", () => {
    const { config } = parseConfig({ ...base, load: { stages: [{ duration: "100s", multiplier: 4 }, { duration: "100s", multiplier: 4 }] } });
    const s = new Schedule(config, 0);
    assert.equal(s.stageAt(50).multiplier, 2);
    assert.equal(s.stageAt(150).multiplier, 4);
    assert.equal(s.stageAt(500).multiplier, 4);
});

test("a flat curve spreads the day's visits evenly", () => {
    const { config } = parseConfig({ ...base, users: { count: 2400 }, population: { dailyActiveShare: 0.5, visitsPerActiveUser: 2, hourlyCurve: new Array(24).fill(1) }, load: { rampUp: "0s" } });
    // 2400 × 0.5 × 2 = 2400 a day = 100 an hour, on any weekday factor.
    const at = new Schedule(config, Date.now()).at(Date.now());
    const factor = config.population.weekdayFactors[at.weekday];
    assert.ok(Math.abs(at.visitsPerHour - 100 * factor) < 1e-6);
});

test("histogram quantiles are within a bucket and survive JSON", () => {
    const h = new Histogram();
    for (let i = 1; i <= 1000; i++) h.add(i);
    assert.ok(Math.abs(h.quantile(0.95) - 950) / 950 < 0.04);
    const back = Histogram.fromJSON(h.toJSON(), h.max);
    assert.equal(back.count, 1000);
    assert.equal(back.quantile(0.95), h.quantile(0.95));
    assert.equal(back.max, 1000);
});
