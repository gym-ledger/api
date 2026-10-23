// pm2 alternative to docker-compose.yml. From this folder:
//
//   npm ci && npm run build
//   cp .env.example .env                       # fill it in
//   pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
//
// Both read .env from this folder; the generator runs LOAD_CONFIG.
const { readFileSync } = require("node:fs");

const env = {};
try {
    for (const line of readFileSync(`${__dirname}/.env`, "utf8").split("\n")) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
} catch {
    // No .env: the shell's environment.
}

module.exports = {
    apps: [
        {
            name: "load-generator",
            script: "dist/cli.js",
            args: `run --config ${env.LOAD_CONFIG || "configs/soak-forever.json"}`,
            cwd: __dirname,
            // Time to write the run's final state on stop.
            kill_timeout: 30000,
            restart_delay: 10000,
            max_memory_restart: "2G",
        },
        {
            name: "load-dashboard",
            script: "dist/ui/server.js",
            args: `--dir runs --host 127.0.0.1 --port ${env.LOAD_UI_PORT || 8099}`,
            cwd: __dirname,
        },
    ],
};
