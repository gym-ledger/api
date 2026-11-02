import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { addDays } from "../../../utils/dates.js";
import {
    checkDayOffRange,
    daysOffUsedInWindow,
    isCountedDayOff,
    isDayOffEditable,
    protectedDaysOff,
} from "./daysOff.rules.js";

const run = (start: string, count: number) =>
    Array.from({ length: count }, (_, i) => addDays(start, i));

describe("protectedDaysOff", () => {
    it("protects up to 10 days off in a row", () => {
        const days = run("2026-11-01", 12);
        const prot = protectedDaysOff(days);
        assert.equal(prot.size, 10);
        assert.ok(prot.has(days[9]));
        assert.ok(!prot.has(days[10]));
        assert.ok(!prot.has(days[11]));
    });

    it("frees the allowance again once old days leave the 30-day window", () => {
        const first = run("2026-11-01", 10);
        // 30 days after the first one: 2026-11-01 is out of its window.
        const later = addDays("2026-11-01", 30);
        assert.ok(protectedDaysOff([...first, later]).has(later));
        // 29 days after: the window still holds all ten.
        const tooSoon = addDays("2026-11-01", 29);
        assert.ok(!protectedDaysOff([...first, tooSoon]).has(tooSoon));
    });

    it("ignores duplicates and order", () => {
        const prot = protectedDaysOff(["2026-11-03", "2026-11-01", "2026-11-03"]);
        assert.deepEqual([...prot].sort(), ["2026-11-01", "2026-11-03"]);
    });
});

describe("daysOffUsedInWindow", () => {
    it("counts the 30 days ending on the day, itself included", () => {
        const days = ["2026-10-03", "2026-10-04", "2026-11-01", "2026-11-02"];
        assert.equal(daysOffUsedInWindow(days, "2026-11-01"), 3); // window 10-03 … 11-01
        assert.equal(daysOffUsedInWindow(days, "2026-11-02"), 3); // 10-03 dropped, 11-02 added
    });
});

describe("isCountedDayOff", () => {
    const required = new Set([1, 3, 5]); // Mon, Wed, Fri
    it("counts a planned day without a workout", () => {
        assert.ok(isCountedDayOff("2026-11-02", required, new Set())); // Monday
    });
    it("doesn't count a day that was trained", () => {
        assert.ok(!isCountedDayOff("2026-11-02", required, new Set(["2026-11-02"])));
    });
    it("doesn't count a day the plan doesn't train", () => {
        assert.ok(!isCountedDayOff("2026-11-03", required, new Set())); // Tuesday
    });
});

describe("checkDayOffRange", () => {
    const today = "2026-11-02";
    it("allows 2 days back to 60 days ahead", () => {
        assert.equal(checkDayOffRange("2026-10-31", "2026-11-02", today), null);
        assert.equal(checkDayOffRange(addDays(today, 50), addDays(today, 60), today), null);
    });
    it("rejects bad ranges", () => {
        assert.equal(checkDayOffRange("2026-10-30", "2026-11-02", today), "too_far_back");
        assert.equal(checkDayOffRange(addDays(today, 55), addDays(today, 61), today), "too_far_ahead");
        assert.equal(checkDayOffRange("2026-11-05", "2026-11-04", today), "end_before_start");
        assert.equal(checkDayOffRange(today, addDays(today, 31), today), "too_long");
    });
});

describe("isDayOffEditable", () => {
    it("is editable from 2 days back onwards", () => {
        assert.ok(isDayOffEditable("2026-10-31", "2026-11-02"));
        assert.ok(!isDayOffEditable("2026-10-30", "2026-11-02"));
    });
});
