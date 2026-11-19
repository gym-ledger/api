import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createEmailChangeToken, isValidEmailChangeToken } from "./crypto.js";
import { maskEmail } from "./email-utils.js";

const USER = "6f1c9d2e-0b7a-4c55-9d1e-2f3a4b5c6d7e";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const MINUTE = 60_000;

describe("email change token", () => {
    it("is valid for its user until it expires", () => {
        const now = Date.now();
        const token = createEmailChangeToken(USER, 15 * MINUTE, now);
        assert.equal(isValidEmailChangeToken(token, USER, now), true);
        assert.equal(isValidEmailChangeToken(token, USER, now + 15 * MINUTE), true);
        assert.equal(isValidEmailChangeToken(token, USER, now + 15 * MINUTE + 1), false);
    });

    it("is refused for another user", () => {
        const token = createEmailChangeToken(USER, 15 * MINUTE);
        assert.equal(isValidEmailChangeToken(token, OTHER), false);
    });

    it("is refused when tampered with or malformed", () => {
        const now = Date.now();
        const token = createEmailChangeToken(USER, 15 * MINUTE, now);
        const [, mac] = token.split(".");
        // A later expiry with the old MAC.
        assert.equal(isValidEmailChangeToken(`${now + 60 * MINUTE}.${mac}`, USER, now), false);
        for (const bad of [undefined, null, "", "abc", `${now + MINUTE}`, `${now + MINUTE}.`, `${token}.x`, `x${token}`]) {
            assert.equal(isValidEmailChangeToken(bad, USER, now), false, String(bad));
        }
    });
});

describe("maskEmail", () => {
    it("keeps the first two letters and the domain", () => {
        assert.equal(maskEmail("john.doe@gmail.com"), "jo***@gmail.com");
        assert.equal(maskEmail("ab@x.io"), "a***@x.io");
        assert.equal(maskEmail("a@x.io"), "a***@x.io");
    });

    it("hides a value that isn't an address", () => {
        assert.equal(maskEmail("nope"), "***");
    });
});
