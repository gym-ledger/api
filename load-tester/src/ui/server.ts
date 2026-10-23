// The dashboard: a small web server over the runs folder. Binds to 127.0.0.1 by default, so on
// a VPS you reach it through an SSH tunnel:
//
//   ssh -N -L 8099:127.0.0.1:8099 you@vps      then open http://localhost:8099
//
//   node dist/ui/server.js [--dir runs] [--port 8099] [--host 127.0.0.1]
//
// LOAD_UI_PASSWORD (optional) adds HTTP basic auth, for when it has to listen beyond localhost.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { RunStore } from "./data.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? fallback : args[i + 1];
};
const dir = resolve(option("dir", process.env.LOAD_RUNS_DIR ?? "runs"));
const port = Number(option("port", process.env.LOAD_UI_PORT ?? "8099"));
const host = option("host", process.env.LOAD_UI_HOST ?? "127.0.0.1");
const password = process.env.LOAD_UI_PASSWORD || undefined;

// src/ui/server.ts and dist/ui/server.js both sit two levels below the package root.
const staticDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "ui");
const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
};
const FILES = new Set(["index.html", "app.js", "app.css", "favicon.svg"]);

const store = new RunStore(dir);

function send(res: ServerResponse, status: number, body: unknown): void {
    const json = JSON.stringify(body);
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(json);
}

function authorised(req: IncomingMessage): boolean {
    if (!password) return true;
    const header = req.headers.authorization ?? "";
    const given = Buffer.from(Buffer.from(header.replace(/^Basic /, ""), "base64").toString("utf8").split(":").slice(1).join(":"));
    const want = Buffer.from(password);
    return given.length === want.length && timingSafeEqual(given, want);
}

const server = createServer((req, res) => {
    try {
        if (!authorised(req)) {
            res.writeHead(401, { "www-authenticate": 'Basic realm="load-tester"' });
            return res.end();
        }
        const url = new URL(req.url ?? "/", "http://x");
        const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        const q = (k: string) => url.searchParams.get(k);

        if (parts[0] === "api") {
            if (parts[1] === "health") return send(res, 200, { ok: true, dir });
            if (parts[1] !== "runs") return send(res, 404, { error: "not found" });
            if (parts.length === 2) return send(res, 200, store.runs());
            const id = parts[2];
            const what = parts[3];
            if (!store.meta(id)) return send(res, 404, { error: "no such run" });
            if (!what) {
                const s = store.summary(id);
                return s ? send(res, 200, s) : send(res, 404, { error: "no such run" });
            }
            if (what === "series") return send(res, 200, store.series(id, q("from"), q("to")));
            if (what === "endpoints") return send(res, 200, store.endpoints(id, q("from"), q("to")) ?? []);
            if (what === "endpoint") return send(res, 200, store.endpoint(id, q("key") ?? "", q("from"), q("to")));
            if (what === "events") return send(res, 200, store.events(id, Math.min(2000, Number(q("limit") ?? 300))));
            if (what === "config") return send(res, 200, store.config(id));
            return send(res, 404, { error: "not found" });
        }

        // The page itself; every other path is the app (it routes in the browser).
        const name = parts.length === 1 && FILES.has(parts[0]) ? parts[0] : "index.html";
        const body = readFileSync(join(staticDir, name));
        res.writeHead(200, { "content-type": TYPES[extname(name)] ?? "application/octet-stream", "cache-control": "no-cache" });
        res.end(body);
    } catch (err) {
        send(res, 500, { error: (err as Error).message });
    }
});

server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(err.code === "EADDRINUSE" ? `port ${port} is taken: pass --port or set LOAD_UI_PORT` : `dashboard: ${err.message}`);
    process.exit(1);
});

server.listen(port, host, () => {
    console.log(`load-tester dashboard on http://${host}:${port} (runs in ${dir})`);
    if (host !== "127.0.0.1" && host !== "localhost" && !password) {
        console.log("  ⚠ listening beyond localhost without LOAD_UI_PASSWORD: anyone who can reach this port sees the runs");
    }
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
