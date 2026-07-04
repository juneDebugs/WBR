import autocannon from "autocannon";

const BASE_URL = "http://localhost:3002";

const pages = [
  { name: "Login", path: "/login" },
  { name: "Dashboard (Home)", path: "/" },
  { name: "Browse", path: "/browse" },
  { name: "Meetings", path: "/meetings" },
  { name: "Profile", path: "/profile" },
  { name: "Requests", path: "/requests" },
  { name: "Staff", path: "/staff" },
];

const results = [];

async function benchPage({ name, path }) {
  const url = `${BASE_URL}${path}`;
  const result = await autocannon({
    url,
    connections: 10,
    duration: 10,
    pipelining: 1,
  });

  results.push({
    page: name,
    path,
    "avg latency (ms)": result.latency.average,
    "p99 latency (ms)": result.latency.p99,
    "max latency (ms)": result.latency.max,
    "req/sec (avg)": result.requests.average,
    "throughput (MB/s)": (result.throughput.average / 1024 / 1024).toFixed(2),
    "total requests": result.requests.total,
    "non-2xx": result.non2xx,
    errors: result.errors,
  });

  console.log(`  ✓ ${name} (${path}) — ${result.requests.average} req/s, avg ${result.latency.average}ms`);
}

console.log(`\n🔥 Meeting Portal Load Test — ${BASE_URL}`);
console.log(`   10 connections, 10 seconds per page\n`);

for (const page of pages) {
  await benchPage(page);
}

console.log("\n" + "=".repeat(120));
console.log("RESULTS SUMMARY");
console.log("=".repeat(120));

// Table header
const cols = ["page", "path", "avg latency (ms)", "p99 latency (ms)", "max latency (ms)", "req/sec (avg)", "throughput (MB/s)", "total requests", "non-2xx", "errors"];
const widths = [20, 12, 16, 16, 16, 13, 17, 15, 8, 8];

console.log(cols.map((c, i) => c.padEnd(widths[i])).join("│ "));
console.log(widths.map((w) => "─".repeat(w)).join("┼─"));

for (const r of results) {
  console.log(
    cols
      .map((c, i) => String(r[c] ?? "").padEnd(widths[i]))
      .join("│ ")
  );
}

console.log("\n" + "=".repeat(120));

// Highlight worst performers
const sorted = [...results].sort((a, b) => b["avg latency (ms)"] - a["avg latency (ms)"]);
console.log(`\n⚠️  Slowest page: ${sorted[0].page} (${sorted[0].path}) — avg ${sorted[0]["avg latency (ms)"]}ms`);
console.log(`✅ Fastest page: ${sorted[sorted.length - 1].page} (${sorted[sorted.length - 1].path}) — avg ${sorted[sorted.length - 1]["avg latency (ms)"]}ms`);

const totalNon2xx = results.reduce((s, r) => s + r["non-2xx"], 0);
const totalErrors = results.reduce((s, r) => s + r.errors, 0);
if (totalNon2xx > 0) console.log(`\n⚠️  Total non-2xx responses: ${totalNon2xx}`);
if (totalErrors > 0) console.log(`❌ Total errors: ${totalErrors}`);
