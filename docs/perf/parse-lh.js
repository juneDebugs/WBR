#!/usr/bin/env node
// Parses Lighthouse JSON reports under docs/perf/lighthouse/ into a markdown table.
// Captures both simulated (lantern) and observed LCP/FCP per PRD §4 amendment.
// Usage: node docs/perf/parse-lh.js [path-to-lighthouse-dir]
//   Default path: docs/perf/lighthouse/
//   Output: markdown table to stdout.

const fs = require('node:fs');
const path = require('node:path');

const dir = process.argv[2] || path.join(__dirname, 'lighthouse');
if (!fs.existsSync(dir)) {
  console.error(`No such directory: ${dir}`);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter((f) => f.startsWith('lh-') && f.endsWith('.json')).sort();

const rows = files.map((file) => {
  const m = file.match(/^lh-([^-]+)-(.+)-(mobile|desktop)\.json$/);
  if (!m) return null;
  const [, app, routeSlug, profile] = m;
  const route = routeSlug === 'root' ? '/' : '/' + routeSlug.replace(/-/g, '/');

  const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const audits = json.audits || {};
  const metrics = (audits.metrics?.details?.items?.[0]) || {};
  const score = json.categories?.performance?.score;
  const resourceItems = audits['resource-summary']?.details?.items || [];

  const byType = Object.fromEntries(resourceItems.map((i) => [i.resourceType, i]));
  const total = byType.total || {};
  const js = byType.script || {};
  const img = byType.image || {};
  const css = byType.stylesheet || {};

  return {
    app,
    route,
    profile,
    score: score != null ? Math.round(score * 100) / 100 : null,
    lcp_sim_ms: audits['largest-contentful-paint']?.numericValue ?? null,
    lcp_obs_ms: metrics.observedLargestContentfulPaint ?? null,
    fcp_sim_ms: audits['first-contentful-paint']?.numericValue ?? null,
    fcp_obs_ms: metrics.observedFirstContentfulPaint ?? null,
    cls: audits['cumulative-layout-shift']?.numericValue ?? null,
    tbt_ms: audits['total-blocking-time']?.numericValue ?? null,
    si_ms: audits['speed-index']?.numericValue ?? null,
    tti_ms: audits['interactive']?.numericValue ?? null,
    total_kb: total.transferSize != null ? Math.round(total.transferSize / 1024) : null,
    js_kb: js.transferSize != null ? Math.round(js.transferSize / 1024) : null,
    img_kb: img.transferSize != null ? Math.round(img.transferSize / 1024) : null,
    css_kb: css.transferSize != null ? Math.round(css.transferSize / 1024) : null,
    reqs: total.requestCount ?? null,
  };
}).filter(Boolean);

const fmtMs = (v) => (v == null ? '—' : v < 1000 ? `${Math.round(v)}ms` : `${(v / 1000).toFixed(2)}s`);
const fmtKb = (v) => (v == null ? '—' : `${v}KB`);
const fmtNum = (v, d = 0) => (v == null ? '—' : v.toFixed(d));

console.log('| App | Route | Profile | Score | LCP sim | LCP obs | FCP sim | FCP obs | CLS | TBT | SI | TTI | Total | JS | IMG | CSS | Reqs |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const cols = [
    r.app,
    r.route,
    r.profile,
    fmtNum(r.score, 2),
    fmtMs(r.lcp_sim_ms),
    fmtMs(r.lcp_obs_ms),
    fmtMs(r.fcp_sim_ms),
    fmtMs(r.fcp_obs_ms),
    fmtNum(r.cls, 3),
    fmtMs(r.tbt_ms),
    fmtMs(r.si_ms),
    fmtMs(r.tti_ms),
    fmtKb(r.total_kb),
    fmtKb(r.js_kb),
    fmtKb(r.img_kb),
    fmtKb(r.css_kb),
    r.reqs ?? '—',
  ];
  console.log('| ' + cols.join(' | ') + ' |');
}
