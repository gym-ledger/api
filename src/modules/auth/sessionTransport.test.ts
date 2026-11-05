import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Request } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { clientPlatformOf, platformMatchesMode, refreshTokenSourceOf } from "./sessionTransport.js";

const req = (headers: Record<string, string>) => ({ headers }) as unknown as Request;
const TOKEN = "ab".repeat(64); // the shape generateRefreshToken() makes

const assertAppError = (fn: () => unknown, statusCode: number) =>
    assert.throws(fn, (error: unknown) => error instanceof AppError && error.statusCode === statusCode);

describe("clientPlatformOf", () => {
    it("is web without the header, so browsers keep the cookie", () => {
        assert.equal(clientPlatformOf(req({})), "web");
    });

    it("reads the native platforms", () => {
        assert.equal(clientPlatformOf(req({ "x-client-platform": "ios" })), "ios");
        assert.equal(clientPlatformOf(req({ "x-client-platform": "android" })), "android");
    });

    it("refuses anything else instead of falling back to the cookie", () => {
        assertAppError(() => clientPlatformOf(req({ "x-client-platform": "web" })), 400);
        assertAppError(() => clientPlatformOf(req({ "x-client-platform": "Android" })), 400);
        assertAppError(() => clientPlatformOf(req({ "x-client-platform": "" })), 400);
    });
});

describe("refreshTokenSourceOf", () => {
    it("uses the cookie when there is no Refresh authorization", () => {
        assert.deepEqual(refreshTokenSourceOf(req({})), { mode: "cookie" });
        assert.deepEqual(refreshTokenSourceOf(req({ authorization: "Bearer x.y.z" })), { mode: "cookie" });
    });

    it("uses the header token and ignores any cookie sent alongside", () => {
        const source = refreshTokenSourceOf(req({
            authorization: `Refresh ${TOKEN}`,
            cookie: "wg_refresh=someone-elses-web-token",
        }));
        assert.deepEqual(source, { mode: "header", token: TOKEN });
    });

    it("rejects a malformed Refresh value as an unusable token (401)", () => {
        assertAppError(() => refreshTokenSourceOf(req({ authorization: "Refresh " })), 401);
        assertAppError(() => refreshTokenSourceOf(req({ authorization: "Refresh not-a-token" })), 401);
        assertAppError(() => refreshTokenSourceOf(req({ authorization: `Refresh ${TOKEN} extra` })), 401);
        assertAppError(() => refreshTokenSourceOf(req({ authorization: `refresh ${TOKEN.toUpperCase()}` })), 401);
    });
});

describe("platformMatchesMode", () => {
    it("lets web sessions refresh only through the cookie", () => {
        assert.equal(platformMatchesMode("web", "cookie"), true);
        assert.equal(platformMatchesMode("web", "header"), false);
    });

    it("lets native sessions refresh only through the header", () => {
        for (const platform of ["ios", "android"] as const) {
            assert.equal(platformMatchesMode(platform, "header"), true);
            assert.equal(platformMatchesMode(platform, "cookie"), false);
        }
    });
});
