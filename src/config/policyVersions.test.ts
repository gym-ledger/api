import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
    CURRENT_POLICY,
    POLICY_VERSIONS,
    needsPolicyReconsent,
    policyVersionsSince,
    type PolicyVersion,
    type ReconsentScope,
} from "./policyVersions.js";

describe("POLICY_VERSIONS", () => {
    it("is in order, unique and well-formed", () => {
        const versions = POLICY_VERSIONS.map((v) => v.version);
        assert.deepEqual([...versions].sort(), versions, "append new versions at the end, in order");
        assert.equal(new Set(versions).size, versions.length, "versions must be unique");
        for (const v of POLICY_VERSIONS) {
            assert.match(v.version, /^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
            assert.match(v.effective_date, /^\d{4}-\d{2}-\d{2}$/);
            assert.ok(v.version.startsWith(v.effective_date), `${v.version} should start with its effective_date`);
            assert.ok(v.summary.trim().length > 0, `${v.version} needs a summary`);
            assert.ok(v.version.length <= 20, "users.privacy_policy_version is VARCHAR(20)");
        }
    });

    it("current is the last entry", () => {
        assert.equal(CURRENT_POLICY, POLICY_VERSIONS[POLICY_VERSIONS.length - 1]);
    });
});

describe("needsPolicyReconsent", () => {
    const v = (version: string, reconsent: ReconsentScope): PolicyVersion =>
        ({ version, effective_date: version.slice(0, 10), reconsent, summary: "x" });
    const list = [
        v("2026-01-01", "everyone"),
        v("2026-02-01", "none"),
        v("2026-03-01", "ai_checkins"),
        v("2026-04-01", "none"),
    ];

    it("always asks someone who never accepted", () => {
        assert.equal(needsPolicyReconsent(null, false, list), true);
    });

    it("doesn't ask someone on the latest version", () => {
        assert.equal(needsPolicyReconsent("2026-04-01", true, list), false);
    });

    it("doesn't ask for non-material versions", () => {
        assert.equal(needsPolicyReconsent("2026-03-01", true, list), false);
    });

    it("asks only AI check-in users for an ai_checkins version", () => {
        assert.equal(needsPolicyReconsent("2026-02-01", true, list), true);
        assert.equal(needsPolicyReconsent("2026-02-01", false, list), false);
    });

    it("asks everyone for an everyone version", () => {
        const withEveryone = [...list, v("2026-05-01", "everyone")];
        assert.equal(needsPolicyReconsent("2026-04-01", false, withEveryone), true);
    });

    it("treats an unknown older version as before every listed one", () => {
        assert.equal(policyVersionsSince("2000-01-01", list).length, list.length);
        assert.equal(needsPolicyReconsent("2000-01-01", false, list), true);
    });

    it("the real list asks a user who accepted nothing", () => {
        assert.equal(needsPolicyReconsent(null, false), true);
        assert.equal(needsPolicyReconsent(CURRENT_POLICY.version, true), false);
    });
});
