// Load tester dashboard: runs list (#/) and a run (#/run/<id>). No build step, no libraries:
// the charts are SVG drawn here, sized to their card, with a crosshair tooltip.
"use strict";

// ── Helpers ──────────────────────────────────────────────────────────────────

const $app = document.getElementById("app");
const $tip = document.getElementById("tooltip");

async function api(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
}

/** Builds an element. Strings become text nodes (never HTML): run data is untrusted. */
function h(tag, attrs, ...children) {
    const el = document.createElementNS(tag.startsWith("svg:") ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xhtml", tag.replace(/^svg:/, ""));
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === false) continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
}
const svg = (tag, attrs, ...children) => h(`svg:${tag}`, attrs, ...children);

const fmt = {
    int: (n) => (n === null || n === undefined || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US")),
    compact(n) {
        if (n === null || n === undefined || !Number.isFinite(n)) return "—";
        const a = Math.abs(n);
        if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
        if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
        if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k`;
        if (a >= 100) return Math.round(n).toLocaleString("en-US");
        if (a >= 10) return n.toFixed(1).replace(/\.0$/, "");
        return n.toFixed(2).replace(/\.?0+$/, "") || "0";
    },
    ms(n) {
        if (n === null || n === undefined || !Number.isFinite(n)) return "—";
        if (n >= 10_000) return `${(n / 1000).toFixed(1)} s`;
        if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
        return `${Math.round(n)} ms`;
    },
    pct(x, digits) {
        if (x === null || x === undefined || !Number.isFinite(x)) return "—";
        const p = x * 100;
        const d = digits ?? (p === 0 ? 0 : p < 0.1 ? 3 : p < 1 ? 2 : 1);
        return `${p.toFixed(d)}%`;
    },
    dur(s) {
        if (s === null || s === undefined || !Number.isFinite(s)) return "forever";
        s = Math.max(0, Math.round(s));
        const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
        if (d) return `${d}d ${hh}h`;
        if (hh) return `${hh}h ${m}m`;
        if (m) return `${m}m ${ss ? `${ss}s` : ""}`.trim();
        return `${ss}s`;
    },
    ago(t) {
        const s = (Date.now() - t) / 1000;
        if (s < 60) return "just now";
        if (s < 3600) return `${Math.floor(s / 60)} min ago`;
        if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
        return `${Math.floor(s / 86400)} d ago`;
    },
    when: (t) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    clock: (t, withDay, withSeconds) => new Date(t).toLocaleString(undefined, withDay
        ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
        : { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined }),
    host(u) {
        try { return new URL(u).host; } catch { return u; }
    },
};

const STATE_LABEL = { running: "Running", finished: "Finished", stopped: "Stopped", aborted: "Aborted", crashed: "Crashed", stale: "Not responding" };
function pill(state) {
    return h("span", { class: `pill ${state}` }, h("span", { class: "dot" }), STATE_LABEL[state] ?? state);
}

const ICON = {
    info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z",
    warn: "M1 21h22L12 2 1 21zm12-3h-2v-2h2zm0-4h-2v-4h2z",
    error: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2zm0-4h-2V7h2z",
};
const icon = (name, size = 16) => svg("svg", { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true" },
    svg("path", { d: ICON[name], fill: "currentColor" }));

// ── Theme ────────────────────────────────────────────────────────────────────

document.getElementById("theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("lt-theme", root.dataset.theme); } catch { /* storage blocked: the theme just isn't remembered */ }
    redrawCharts();
});
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ── Charts ───────────────────────────────────────────────────────────────────

const charts = new Set();
function redrawCharts() {
    for (const host of charts) {
        if (!host.isConnected) charts.delete(host);
        else drawChart(host, host._opts);
    }
}
new ResizeObserver(() => redrawCharts()).observe(document.body);

function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
}

/**
 * A time-series chart. opts: { times, series: [{ name, color, values, dash }], stacked,
 * yFmt, threshold: { value, label }, height, spanMs }. Gaps (no data for a while: the run was
 * stopped) break the lines.
 */
function chart(opts) {
    const host = h("div", { class: "chart" });
    host._opts = opts;
    charts.add(host);
    requestAnimationFrame(() => drawChart(host, opts));
    return host;
}

function drawChart(host, o) {
    host._opts = o;
    host.replaceChildren();
    const W = Math.max(260, host.clientWidth || 600);
    const H = o.height ?? 190;
    const m = { l: 50, r: 10, t: 10, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = o.times.length;
    if (!n || o.series.every((s) => s.values.every((v) => !v))) {
        host.append(h("div", { class: "nodata", style: { height: `${H}px` } }, o.empty ?? "No requests in this range yet"));
        return;
    }
    const t0 = o.times[0], t1 = o.times[n - 1] === t0 ? t0 + 1 : o.times[n - 1];
    const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;

    // Stacked series are drawn on cumulative baselines.
    const tops = o.series.map(() => new Array(n).fill(0));
    let dataMax = 0;
    for (let i = 0; i < n; i++) {
        let acc = 0;
        o.series.forEach((s, k) => {
            const v = s.values[i] ?? 0;
            acc = o.stacked ? acc + v : v;
            tops[k][i] = acc;
            dataMax = Math.max(dataMax, acc);
        });
    }
    const thr = o.threshold?.value;
    const yMax = niceMax(thr && thr < dataMax * 1.6 ? Math.max(dataMax, thr * 1.08) : dataMax * 1.08);
    const y = (v) => m.t + ih - (v / yMax) * ih;

    // Breaks where points are much further apart than usual.
    const steps = o.times.slice(1).map((t, i) => t - o.times[i]).sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length / 2)] || 1;
    const broken = (i) => i > 0 && o.times[i] - o.times[i - 1] > typical * 4;

    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img", "aria-label": o.label ?? "" });
    const grid = cssVar("--grid"), axis = cssVar("--axis"), muted = cssVar("--muted"), surface = cssVar("--surface");

    for (let k = 0; k <= 4; k++) {
        const v = (yMax / 4) * k;
        const yy = Math.round(y(v)) + 0.5;
        root.append(svg("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, stroke: k === 0 ? axis : grid, "stroke-width": 1 }));
        root.append(svg("text", { x: m.l - 8, y: yy + 4, "text-anchor": "end", "font-size": 11, fill: muted, class: "num" }, o.yFmt(v)));
    }
    const span = t1 - t0;
    const withDay = span > 36 * 3600_000;
    const ticks = Math.max(2, Math.min(7, Math.floor(iw / 95)));
    for (let k = 0; k <= ticks; k++) {
        const t = t0 + (span / ticks) * k;
        root.append(svg("text", { x: x(t), y: H - 6, "text-anchor": k === 0 ? "start" : k === ticks ? "end" : "middle", "font-size": 11, fill: muted }, fmt.clock(t, withDay, span < 15 * 60_000)));
    }

    const path = (vals, base) => {
        let d = "";
        for (let i = 0; i < n; i++) d += `${!d || broken(i) ? "M" : "L"}${x(o.times[i]).toFixed(1)},${y(vals[i]).toFixed(1)}`;
        if (!base) return d;
        // Closed area down to the series below (or zero), segment by segment between breaks.
        let area = "";
        let start = 0;
        for (let i = 1; i <= n; i++) {
            if (i === n || broken(i)) {
                let seg = "";
                for (let j = start; j < i; j++) seg += `${j === start ? "M" : "L"}${x(o.times[j]).toFixed(1)},${y(vals[j]).toFixed(1)}`;
                for (let j = i - 1; j >= start; j--) seg += `L${x(o.times[j]).toFixed(1)},${y(base[j]).toFixed(1)}`;
                area += `${seg}Z`;
                start = i;
            }
        }
        return area;
    };

    if (o.stacked) {
        o.series.forEach((s, k) => {
            const base = k ? tops[k - 1] : new Array(n).fill(0);
            root.append(svg("path", { d: path(tops[k], base), fill: s.color, "fill-opacity": 0.82, stroke: surface, "stroke-width": 1, "stroke-linejoin": "round" }));
        });
    } else {
        o.series.forEach((s, k) => {
            root.append(svg("path", {
                d: path(tops[k]), fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
                "stroke-dasharray": s.dash ? "5 4" : null,
            }));
        });
    }
    if (thr && thr <= yMax) {
        const yy = y(thr);
        root.append(svg("line", { x1: m.l, x2: W - m.r, y1: yy, y2: yy, stroke: cssVar("--ink-2"), "stroke-width": 1.2, "stroke-dasharray": "4 4", opacity: 0.8 }));
        root.append(svg("text", { x: W - m.r - 2, y: yy - 5, "text-anchor": "end", "font-size": 11, fill: cssVar("--ink-2") }, o.threshold.label));
    }

    // Crosshair: snaps to the nearest point; the tooltip lists every series there.
    const cross = svg("line", { y1: m.t, y2: m.t + ih, stroke: cssVar("--ink-2"), "stroke-width": 1, opacity: 0, "pointer-events": "none" });
    const dots = svg("g", { "pointer-events": "none" });
    root.append(cross, dots);
    const hit = svg("rect", { x: m.l, y: 0, width: iw, height: H, fill: "transparent", tabindex: 0, "aria-label": `${o.label ?? "chart"}: use arrow keys to read values` });
    root.append(hit);
    let focusIdx = n - 1;
    const show = (i, clientX, clientY) => {
        focusIdx = i;
        const xx = x(o.times[i]);
        cross.setAttribute("x1", xx);
        cross.setAttribute("x2", xx);
        cross.setAttribute("opacity", 0.6);
        dots.replaceChildren(...o.series.map((s, k) => svg("circle", { cx: xx, cy: y(tops[k][i]), r: 4, fill: s.color, stroke: surface, "stroke-width": 2 })));
        $tip.replaceChildren(
            h("div", { class: "tt-time" }, new Date(o.times[i]).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: span < 3 * 3600_000 ? "2-digit" : undefined })),
            ...[...o.series].reverse().map((s) => h("div", { class: "tt-row" },
                h("span", { class: `key-line${s.dash ? " dash" : ""}`, style: { background: s.color, borderColor: s.color } }),
                h("b", {}, o.yFmt(s.values[i] ?? 0, true)),
                h("span", {}, s.name))),
            ...(o.extra ? [o.extra(i)].flat().filter(Boolean).map((e) => h("div", { class: "tt-row" }, h("span", { class: "key-line", style: { background: "transparent" } }), h("b", {}, e[0]), h("span", {}, e[1]))) : []),
        );
        $tip.hidden = false;
        const r = $tip.getBoundingClientRect();
        let left = clientX + 14;
        if (left + r.width > innerWidth - 8) left = clientX - r.width - 14;
        $tip.style.left = `${Math.max(8, left)}px`;
        $tip.style.top = `${Math.min(innerHeight - r.height - 8, Math.max(8, clientY - r.height / 2))}px`;
    };
    const hide = () => {
        cross.setAttribute("opacity", 0);
        dots.replaceChildren();
        $tip.hidden = true;
    };
    const nearest = (clientX) => {
        const box = root.getBoundingClientRect();
        const t = t0 + ((clientX - box.left) * (W / box.width) - m.l) / iw * (t1 - t0);
        let lo = 0, hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (o.times[mid] < t) lo = mid + 1; else hi = mid;
        }
        return lo > 0 && t - o.times[lo - 1] < o.times[lo] - t ? lo - 1 : lo;
    };
    hit.addEventListener("pointermove", (e) => show(nearest(e.clientX), e.clientX, e.clientY));
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("blur", hide);
    hit.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        focusIdx = Math.max(0, Math.min(n - 1, focusIdx + (e.key === "ArrowLeft" ? -1 : 1)));
        const box = root.getBoundingClientRect();
        show(focusIdx, box.left + (x(o.times[focusIdx]) / W) * box.width, box.top + box.height / 3);
    });
    host.append(root);
}

function legend(series, kind = "line") {
    if (series.length < 2) return null;
    return h("div", { class: "legend" }, series.map((s) => h("span", {},
        kind === "rect" ? h("i", { class: "key-rect", style: { background: s.color } }) : h("i", { class: `key-line${s.dash ? " dash" : ""}`, style: { background: s.color, borderColor: s.color } }),
        s.name)));
}

function chartCard(title, sub, opts, { wide, keys } = {}) {
    return h("section", { class: `card chart-card${wide ? " wide" : ""}` },
        h("div", { class: "chart-head" },
            h("div", {}, h("h2", {}, title), sub ? h("div", { class: "sub" }, sub) : null),
            legend(opts.series, keys)),
        chart({ ...opts, label: title }));
}

// ── Router ───────────────────────────────────────────────────────────────────

let teardown = () => {};
function route() {
    teardown();
    teardown = () => {};
    $tip.hidden = true;
    const hash = location.hash.replace(/^#/, "") || "/";
    const m = /^\/run\/([^/?]+)/.exec(hash);
    if (m) teardown = runView(decodeURIComponent(m[1]));
    else teardown = listView();
    window.scrollTo(0, 0);
}
addEventListener("hashchange", route);

function poll(fn, ms) {
    let timer = null;
    let stopped = false;
    const loop = async () => {
        if (stopped) return;
        try { await fn(); } catch (err) { console.error(err); }
        if (!stopped) timer = setTimeout(loop, ms());
    };
    loop();
    return () => {
        stopped = true;
        clearTimeout(timer);
    };
}

// ── Runs list ────────────────────────────────────────────────────────────────

function listView() {
    document.title = "Load Tester";
    const box = h("div", { class: "runs" });
    $app.replaceChildren(
        h("div", { class: "list-head" },
            h("div", {}, h("h1", {}, "Runs"), h("div", { class: "muted" }, "Every run the generator has written to its runs folder.")),
            h("span", { class: "refresh" }, h("span", { class: "dot" }), "Updates every 10 s")),
        box);
    return poll(async () => {
        const runs = await api("/api/runs");
        if (!runs.length) {
            box.replaceChildren(h("div", { class: "card empty" },
                h("p", {}, "No runs yet. Start one on this machine:"),
                h("pre", {}, "docker compose up -d                  # generator + dashboard\n# or: node dist/cli.js run --config configs/typical-day.json")));
            return;
        }
        box.replaceChildren(...runs.map(runRow));
    }, () => 10_000);
}

function runRow(r) {
    const m = r.meta;
    const t = r.totals;
    const end = m.endedAt ?? r.lastSeen ?? Date.now();
    const elapsed = (end - m.startedAt) / 1000;
    const err = t?.c?.n ? (t.c.server + t.c.network) / t.c.n : null;
    const cell = (v, l, cls) => h("div", { class: "stat-cell" }, h("div", { class: `v ${cls ?? ""}` }, v), h("div", { class: "l" }, l));
    return h("a", { class: "card run-row", href: `#/run/${encodeURIComponent(m.id)}` },
        h("div", { class: "run-name" }, pill(r.state), h("strong", {}, m.name)),
        h("div", { class: "run-sub" }, `${fmt.host(m.target)} · started ${fmt.when(m.startedAt)} (${fmt.ago(m.startedAt)})${m.restarts?.length ? ` · ${m.restarts.length} restart${m.restarts.length > 1 ? "s" : ""}` : ""}`),
        cell(`${fmt.dur(elapsed)}${m.durationS ? ` / ${fmt.dur(m.durationS)}` : r.state === "running" ? " / ∞" : ""}`, "Duration"),
        cell(fmt.compact(t?.c?.n ?? 0), "Requests"),
        cell(t?.c?.n ? fmt.pct(err) : "—", "Errors", err > 0.01 ? "cell-bad" : err > 0.001 ? "cell-warn" : ""),
        cell(fmt.ms(t?.l?.p95), "p95"),
        cell(r.live ? fmt.int(r.live.act) : "—", "In app now"));
}

// ── A run ────────────────────────────────────────────────────────────────────

const RANGES = [["15m", 15 * 60_000], ["1h", 3600_000], ["6h", 6 * 3600_000], ["24h", 86_400_000], ["7d", 7 * 86_400_000], ["All", null]];

const VISIT_LABEL = { workout: "Working out", quickCheck: "Quick check", weighIn: "Weigh-in", progress: "Progress", explore: "Browsing", settings: "Settings" };
const VISIT_SLOT = { workout: "--s1", quickCheck: "--s2", weighIn: "--s3", progress: "--s4", explore: "--s5", settings: "--s6" };

function runView(id) {
    let range = sessionStorageGet(`lt-range`) ?? "1h";
    let summary = null;
    let config = null;
    let endpointsSort = { key: "n", dir: -1 };
    let endpointFilter = "";
    let onlyProblems = false;
    let openEndpoint = null;
    let endpointsData = [];
    let lastSeries = null;

    const head = h("div");
    const rangeSeg = h("div", { class: "seg", role: "group", "aria-label": "Time range" });
    const refreshNote = h("span", { class: "refresh" });
    const kpis = h("div", { class: "kpis" });
    const chartGrid = h("div", { class: "charts" });
    const activity = h("div", { class: "activity" });
    const tblBody = h("tbody");
    const tblHead = h("thead");
    const search = h("input", { class: "search", type: "search", placeholder: "Filter endpoints…", "aria-label": "Filter endpoints" });
    const problems = h("input", { type: "checkbox" });
    const endpointsCard = h("section", { class: "card" },
        h("div", { class: "tbl-tools" }, search, h("label", { class: "check" }, problems, "Only with errors")),
        h("div", { class: "tbl-wrap" }, h("table", {}, tblHead, tblBody)));
    const events = h("div", { class: "events" });
    const levelSeg = h("div", { class: "seg", role: "group", "aria-label": "Event level" });
    let level = "all";
    const configBox = h("details", { class: "card config" }, h("summary", {}, "Config"), h("pre", {}, "…"));

    $app.replaceChildren(
        h("a", { class: "back", href: "#/" }, "← All runs"),
        head,
        h("div", { class: "filters" }, rangeSeg, refreshNote),
        kpis,
        h("div", { class: "section-title" }, h("h2", {}, "Over time"), h("p", {}, "Hover a chart for values; ← → with a chart focused.")),
        chartGrid,
        h("div", { class: "section-title" }, h("h2", {}, "What people did"), h("p", {}, "Counts in the selected range.")),
        activity,
        h("div", { class: "section-title" }, h("h2", {}, "Endpoints"), h("p", {}, "Click a row for its latency over time.")),
        endpointsCard,
        h("div", { class: "section-title" }, h("h2", {}, "Events"), levelSeg),
        h("section", { class: "card" }, events),
        configBox,
    );

    const live = () => summary?.state === "running";
    const window_ = () => {
        const span = RANGES.find((r) => r[0] === range)[1];
        if (!span || !summary) return "";
        const end = summary.meta.endedAt ?? (live() ? Date.now() : summary.lastSeen ?? Date.now());
        return `?from=${Math.round(end - span)}&to=${Math.round(end)}`;
    };

    const drawRanges = () => rangeSeg.replaceChildren(...RANGES.map(([label]) => h("button", {
        type: "button", "aria-pressed": String(label === range),
        onclick: () => {
            range = label;
            sessionStorageSet("lt-range", label);
            drawRanges();
            $app.classList.add("loading");
            refreshAll().finally(() => $app.classList.remove("loading"));
        },
    }, label)));
    drawRanges();

    const drawLevels = () => levelSeg.replaceChildren(...["all", "warn", "error"].map((l) => h("button", {
        type: "button", "aria-pressed": String(l === level),
        onclick: () => { level = l; drawLevels(); loadEvents(); },
    }, l === "all" ? "All" : l === "warn" ? "Warnings" : "Errors")));
    drawLevels();

    search.addEventListener("input", () => { endpointFilter = search.value.toLowerCase(); drawEndpoints(); });
    problems.addEventListener("change", () => { onlyProblems = problems.checked; drawEndpoints(); });
    configBox.addEventListener("toggle", async () => {
        if (!configBox.open || config) return;
        config = await api(`/api/runs/${encodeURIComponent(id)}/config`);
        configBox.querySelector("pre").textContent = JSON.stringify(config, null, 2);
    });

    // ── Header ──
    const drawHead = () => {
        const m = summary.meta;
        document.title = `${m.name} · Load Tester`;
        const end = m.endedAt ?? summary.lastSeen ?? Date.now();
        const banners = [];
        if (summary.state === "stale") banners.push(h("div", { class: "banner" }, icon("warn"), h("div", {}, `The generator stopped writing ${fmt.ago(summary.lastSeen ?? m.startedAt)} without closing the run: it was killed or the machine went down. If it restarts with the same config it resumes this run.`)));
        if (m.status === "aborted") banners.push(h("div", { class: "banner critical" }, icon("error"), h("div", {}, `Stopped early: ${m.stopReason}`)));
        head.replaceChildren(
            h("div", { class: "run-head" }, h("h1", {}, m.name), pill(summary.state)),
            m.description ? h("p", { class: "run-desc" }, m.description) : null,
            h("div", { class: "run-meta" },
                h("span", {}, "Target ", h("b", {}, fmt.host(m.target))),
                h("span", {}, "Started ", h("b", {}, fmt.when(m.startedAt))),
                h("span", {}, "Ran ", h("b", {}, fmt.dur((end - m.startedAt) / 1000)), m.durationS ? ` of ${fmt.dur(m.durationS)}` : live() ? " of ∞" : ""),
                m.restarts?.length ? h("span", {}, "Restarts ", h("b", {}, m.restarts.length)) : null,
                h("span", {}, "From ", h("b", {}, m.host)),
                h("span", { class: "mono muted" }, m.id)),
            banners);
        refreshNote.className = `refresh${live() ? "" : " paused"}`;
        refreshNote.replaceChildren(h("span", { class: "dot" }), live() ? "Live · updates every 5 s" : "Not running · showing what was recorded");
    };

    // ── KPIs ──
    const drawKpis = (series) => {
        const r = series.range;
        const s = summary.live;
        const thr = s?.thresholds;
        const limits = summary.meta && config?.thresholds;
        const errNow = thr ? thr.errorRate : r.errorRate;
        const p95Now = thr ? thr.p95 : r.p95;
        const peakRps = Math.max(0, ...series.points.map((p) => p.rps));
        const tile = (label, value, unit, sub, cls) => h("div", { class: `card kpi ${cls ?? ""}` },
            h("div", { class: "l" }, label), h("div", { class: "v num" }, value, unit ? h("small", {}, unit) : null), h("div", { class: "s" }, sub));
        const win = thr ? `last ${thr.minutes} min` : "range";
        kpis.replaceChildren(
            tile("Requests / s", fmt.compact(s ? s.rps : r.rps), null, `range avg ${fmt.compact(r.rps)} · peak ${fmt.compact(peakRps)}`),
            tile(`p95 latency (${win})`, fmt.ms(p95Now).replace(/ (ms|s)$/, ""), fmt.ms(p95Now).split(" ")[1], `range p50 ${fmt.ms(r.p50)} · p99 ${fmt.ms(r.p99)}`,
                limits && p95Now > limits.p95Ms ? "bad" : ""),
            tile(`Server errors (${win})`, fmt.pct(errNow), null, `5xx + no response · ${fmt.int(r.c.server + r.c.network)} in range`,
                limits && errNow > limits.errorRate ? "bad" : errNow > 0 ? "warn" : ""),
            tile("Rate-limited", fmt.compact(r.c.limited), null, `429s in range · ${fmt.pct(r.c.n ? r.c.limited / r.c.n : 0)}`),
            tile(s ? "In the app now" : "In the app (avg)", fmt.int(s ? s.act : r.act), null, `range avg ${fmt.compact(r.act)} · peak ${fmt.int(r.actMax)}`),
            tile("Live streams", fmt.int(s ? s.sse : r.sse), null, "open notification streams (SSE)"),
            tile("Generator lag", fmt.int(s ? s.lag : r.lagMax), "ms", s ? `event loop p99 · ${fmt.int(s.inf)} in flight · ${fmt.int(s.rss)} MB` : "worst event-loop p99 in range",
                (s ? s.lag : r.lagMax) > 200 ? "warn" : ""),
        );
    };

    // ── Charts ──
    const drawCharts = (series) => {
        const pts = series.points;
        const times = pts.map((p) => p.t);
        const per = (k) => pts.map((p) => (p.s ? p.c[k] / p.s : 0));
        const thr = config?.thresholds;
        const byKind = Object.keys(VISIT_LABEL).map((k) => ({ name: VISIT_LABEL[k], color: cssVar(VISIT_SLOT[k]), values: pts.map((p) => p.kinds?.[k] ?? 0) }));
        const res = {
            fine: series.kind === "ticks" ? "per 10 s" : series.kind === "minutes" ? "per minute" : "per hour",
        };
        chartGrid.replaceChildren(
            chartCard("Requests per second", `by outcome · ${res.fine}`, {
                times, stacked: true, yFmt: (v) => fmt.compact(v),
                series: [
                    { name: "OK", color: cssVar("--good"), values: per("ok") },
                    { name: "Rate-limited (429)", color: cssVar("--warning"), values: per("limited") },
                    { name: "Client errors (4xx)", color: cssVar("--serious"), values: per("client") },
                    { name: "Server errors / no response", color: cssVar("--critical"), values: pts.map((p) => (p.s ? (p.c.server + p.c.network) / p.s : 0)) },
                ],
            }, { keys: "rect" }),
            chartCard("Latency", "every request, including body download", {
                times, yFmt: (v, exact) => (exact ? fmt.ms(v) : v >= 1000 ? `${v / 1000}s` : `${Math.round(v)}`),
                threshold: thr ? { value: thr.p95Ms, label: `p95 limit ${fmt.ms(thr.p95Ms)}` } : null,
                series: [
                    { name: "p50", color: cssVar("--s1"), values: pts.map((p) => p.p50) },
                    { name: "p95", color: cssVar("--s2"), values: pts.map((p) => p.p95) },
                    { name: "p99", color: cssVar("--s3"), values: pts.map((p) => p.p99) },
                ],
            }),
            chartCard("People in the app", "by why they opened it", { times, stacked: true, yFmt: (v) => fmt.compact(v), series: byKind,
                extra: (i) => [[fmt.int(pts[i].sse), "notification streams"]] }, { keys: "rect" }),
            chartCard("Server error rate", "5xx and no response, share of all requests", {
                times, yFmt: (v, exact) => fmt.pct(v, exact ? undefined : v < 0.01 ? 2 : 1),
                threshold: thr ? { value: thr.errorRate, label: `limit ${fmt.pct(thr.errorRate)}` } : null,
                series: [{ name: "Error rate", color: cssVar("--critical"), values: pts.map((p) => p.errorRate) }],
            }),
            chartCard("Arrivals wanted", "app opens per hour the schedule asks for", {
                times, yFmt: (v) => fmt.compact(v),
                series: [{ name: "Wanted", color: cssVar("--s7"), values: pts.map((p) => p.want) }],
                extra: (i) => [[fmt.int((pts[i].k.visitsStarted ?? 0) / (pts[i].s || 1) * 3600), "started (per hour)"], [fmt.int(pts[i].k.visitsDropped ?? 0), "dropped"]],
            }),
            chartCard("Generator health", "event-loop delay p99 · over ~100 ms the generator, not the API, is the bottleneck", {
                times, yFmt: (v, exact) => (exact ? `${Math.round(v)} ms` : `${Math.round(v)}`),
                threshold: { value: 100, label: "100 ms" },
                series: [{ name: "Event-loop lag", color: cssVar("--s4"), values: pts.map((p) => p.lag) }],
                extra: (i) => [[fmt.int(pts[i].inf), "requests in flight"]],
            }),
        );
    };

    // ── Activity ──
    const drawActivity = (series) => {
        const k = series.range.k;
        const v = (key) => k[key] ?? 0;
        const row = (label, value, why) => h("div", { class: "act-row" }, h("span", {}, label, why ? h("span", { class: "why" }, why) : null), h("b", {}, value));
        const typed = v("loginsOk") + v("loginTypos");
        activity.replaceChildren(
            h("section", { class: "card act-card" }, h("h3", {}, "Visits"),
                row("Started", fmt.int(v("visitsStarted"))),
                row("Finished", fmt.int(v("visitsFinished"))),
                row("Couldn't get in", fmt.int(v("visitsFailed")), "sign-in failed or the API errored early"),
                row("Dropped", fmt.int(v("visitsDropped")), "no idle user / concurrency cap")),
            h("section", { class: "card act-card" }, h("h3", {}, "Signing in"),
                row("Password logins", fmt.int(v("loginsOk"))),
                row("Mistyped passwords", `${fmt.int(v("loginTypos"))} · ${fmt.pct(typed ? v("loginTypos") / typed : 0)}`, "share of typed passwords"),
                row("Gave up", fmt.int(v("loginsGivenUp"))),
                row("Session refreshes", fmt.int(v("refreshesOk"))),
                row("Expired sessions", fmt.int(v("refreshesExpired"))),
                row("Logouts", fmt.int(v("logouts")))),
            h("section", { class: "card act-card" }, h("h3", {}, "Training"),
                row("Workouts started", fmt.int(v("workoutsStarted"))),
                row("Workouts finished", fmt.int(v("workoutsFinished"))),
                row("Left unfinished", fmt.int(v("workoutsAbandoned"))),
                row("Sets logged", fmt.int(v("setsLogged"))),
                row("Offline syncs", fmt.int(v("offlineBatches")), "batches of sets queued without signal"),
                row("Weigh-ins", fmt.int(v("weighIns")))),
            h("section", { class: "card act-card" }, h("h3", {}, "Accounts & realtime"),
                row("Onboarded", fmt.int(v("onboardings"))),
                row("Plans picked", fmt.int(v("plansSelected"))),
                row("Goals set", fmt.int(v("goalsSet"))),
                row("Stream connects", fmt.int(v("streamConnects"))),
                row("Stream drops", fmt.int(v("streamDrops")), "ended by the server or network"),
                row("Stream messages", fmt.int(v("streamMessages")))),
            h("section", { class: "card act-card" }, h("h3", {}, "Bots"),
                row("Credential-stuffing tries", fmt.int(v("botAttempts"))),
                row("Blocked (429)", `${fmt.int(v("botBlocked"))} · ${fmt.pct(v("botAttempts") ? v("botBlocked") / v("botAttempts") : 0)}`),
                row("Got in", fmt.int(v("botSuccesses")), "should always be 0"),
                row("OTP codes sent", fmt.int(v("otpSends")), "paid: only with paid.otpSends")),
        );
    };

    // ── Endpoints ──
    const COLS = [
        ["key", "Endpoint"], ["n", "Requests"], ["rps", "Req/s"], ["p50", "p50"], ["p95", "p95"], ["p99", "p99"], ["max", "Max"],
        ["client", "4xx"], ["limited", "429"], ["fail", "5xx / net"], ["errorRate", "Error %"],
    ];
    const drawEndpoints = () => {
        tblHead.replaceChildren(h("tr", {}, COLS.map(([k, label]) => h("th", {
            scope: "col",
            "aria-sort": endpointsSort.key === k ? (endpointsSort.dir < 0 ? "descending" : "ascending") : null,
            onclick: () => {
                endpointsSort = { key: k, dir: endpointsSort.key === k ? -endpointsSort.dir : k === "key" ? 1 : -1 };
                drawEndpoints();
            },
        }, label))));
        const val = (e, k) => (k === "fail" ? e.server + e.network : e[k]);
        const rows = endpointsData
            .filter((e) => !endpointFilter || e.key.toLowerCase().includes(endpointFilter))
            .filter((e) => !onlyProblems || e.server + e.network + e.client > 0)
            .sort((a, b) => {
                const k = endpointsSort.key;
                const x = val(a, k), y = val(b, k);
                return (typeof x === "string" ? x.localeCompare(y) : x - y) * endpointsSort.dir;
            });
        const maxN = Math.max(1, ...rows.map((e) => e.n));
        const out = [];
        for (const e of rows) {
            const [method, ...rest] = e.key.split(" ");
            const path = rest.join(" ");
            const bot = path.includes("· bot");
            const fail = e.server + e.network;
            const cls = (n, bad) => (n === 0 ? "zero" : bad ? "cell-bad" : "cell-warn");
            const tr = h("tr", { class: openEndpoint === e.key ? "open" : "", tabindex: 0, onclick: () => toggle(e.key), onkeydown: (ev) => ev.key === "Enter" && toggle(e.key) },
                h("td", { class: "ep", title: e.key }, h("span", { class: "m" }, method), path.replace(" · bot", ""), bot ? h("span", { class: "bot" }, "bots") : null),
                h("td", { class: "bar-cell" }, fmt.int(e.n), h("i", { style: { width: `${Math.max(2, (e.n / maxN) * 60)}px` } })),
                h("td", {}, fmt.compact(e.rps)),
                h("td", {}, fmt.ms(e.p50)), h("td", {}, fmt.ms(e.p95)), h("td", {}, fmt.ms(e.p99)), h("td", {}, fmt.ms(e.max)),
                h("td", { class: cls(e.client, false) }, fmt.int(e.client)),
                h("td", { class: e.limited ? (bot ? "" : "cell-warn") : "zero" }, fmt.int(e.limited)),
                h("td", { class: cls(fail, true) }, fmt.int(fail)),
                h("td", { class: e.errorRate > 0 ? "cell-bad" : "zero" }, fmt.pct(e.errorRate)));
            out.push(tr);
            if (openEndpoint === e.key) out.push(endpointDetail(e));
        }
        if (!out.length) out.push(h("tr", {}, h("td", { colspan: COLS.length, class: "muted", style: { textAlign: "center", padding: "24px" } }, endpointsData.length ? "No endpoint matches." : "No requests in this range.")));
        tblBody.replaceChildren(...out);
    };
    const toggle = (key) => {
        openEndpoint = openEndpoint === key ? null : key;
        drawEndpoints();
    };
    const endpointDetail = (e) => {
        const cell = h("td", { colspan: COLS.length });
        const wrap = h("div", { class: "charts", style: { marginTop: "6px" } });
        cell.append(wrap);
        api(`/api/runs/${encodeURIComponent(id)}/endpoint${window_() || "?"}${window_() ? "&" : ""}key=${encodeURIComponent(e.key)}`).then((d) => {
            const times = d.points.map((p) => p.t);
            const statuses = Object.entries(e.statuses).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}: ${fmt.int(n)}`).join(" · ");
            wrap.replaceChildren(
                chartCard("Latency", statuses, {
                    times, height: 160, yFmt: (v, exact) => (exact ? fmt.ms(v) : v >= 1000 ? `${v / 1000}s` : `${Math.round(v)}`),
                    series: [
                        { name: "p50", color: cssVar("--s1"), values: d.points.map((p) => p.p50) },
                        { name: "p95", color: cssVar("--s2"), values: d.points.map((p) => p.p95) },
                        { name: "p99", color: cssVar("--s3"), values: d.points.map((p) => p.p99) },
                    ],
                }),
                chartCard("Requests per second", d.kind === "minutes" ? "per minute" : "per hour", {
                    times, height: 160, stacked: true, yFmt: (v) => fmt.compact(v),
                    series: [
                        { name: "OK", color: cssVar("--good"), values: d.points.map((p) => (p.s ? p.c.ok / p.s : 0)) },
                        { name: "429", color: cssVar("--warning"), values: d.points.map((p) => (p.s ? p.c.limited / p.s : 0)) },
                        { name: "4xx", color: cssVar("--serious"), values: d.points.map((p) => (p.s ? p.c.client / p.s : 0)) },
                        { name: "5xx / net", color: cssVar("--critical"), values: d.points.map((p) => (p.s ? (p.c.server + p.c.network) / p.s : 0)) },
                    ],
                }, { keys: "rect" }));
        }).catch((err) => wrap.replaceChildren(h("div", { class: "err" }, err.message)));
        return h("tr", { class: "detail" }, cell);
    };

    // ── Events ──
    const loadEvents = async () => {
        const list = await api(`/api/runs/${encodeURIComponent(id)}/events?limit=500`);
        const shown = list.filter((e) => level === "all" || e.level === level || (level === "warn" && e.level === "error"));
        events.replaceChildren(...(shown.length ? shown.map((e) => h("div", { class: `ev ${e.level}` },
            icon(e.level === "error" ? "error" : e.level === "warn" ? "warn" : "info"),
            h("span", { class: "t" }, new Date(e.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })),
            h("span", { class: "k" }, e.kind),
            h("span", { class: "m" }, e.message))) : [h("div", { class: "empty" }, "Nothing to report.")]));
    };

    // ── Loading ──
    const loadSummary = async () => {
        summary = await api(`/api/runs/${encodeURIComponent(id)}`);
        if (!config) config = await api(`/api/runs/${encodeURIComponent(id)}/config`);
        drawHead();
    };
    const loadSeries = async () => {
        lastSeries = await api(`/api/runs/${encodeURIComponent(id)}/series${window_()}`);
        drawKpis(lastSeries);
        drawCharts(lastSeries);
        drawActivity(lastSeries);
    };
    const loadEndpoints = async () => {
        endpointsData = await api(`/api/runs/${encodeURIComponent(id)}/endpoints${range === "All" ? "" : window_()}`);
        drawEndpoints();
    };
    const refreshAll = async () => {
        await loadSummary();
        await Promise.all([loadSeries(), loadEndpoints(), loadEvents()]);
    };

    let ticks = 0;
    const stopPoll = poll(async () => {
        try {
            if (ticks++ === 0 || !summary) return await refreshAll();
            if (!live()) return;
            await loadSummary();
            await loadSeries();
            if (ticks % 3 === 0) await Promise.all([loadEndpoints(), loadEvents()]);
        } catch (err) {
            if (!summary) $app.replaceChildren(h("a", { class: "back", href: "#/" }, "← All runs"), h("div", { class: "card err" }, `Can't load this run: ${err.message}`));
            throw err;
        }
    }, () => 5000);
    return stopPoll;
}

function sessionStorageGet(k) {
    try { return sessionStorage.getItem(k); } catch { return null; }
}
function sessionStorageSet(k, v) {
    try { sessionStorage.setItem(k, v); } catch { /* storage blocked: not remembered */ }
}

route();
