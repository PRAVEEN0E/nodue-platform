/* Modest, honest load probe (no deps, Node 18+ global fetch).
 * Measures API capacity under bounded concurrency. This is NOT a 15k-user
 * proof — it characterizes single-instance dev behavior and finds cliffs.
 * Usage: node scripts/loadtest.mjs [--vus=25] [--secs=30]
 */
const BASES = (process.env.LOAD_API_URLS || process.env.LOAD_API_URL || "http://localhost:5000/api/v1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const BASE = BASES[0];

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, Number(v)];
  })
);
const VUS = args.vus || 25;
const SECS = args.secs || 30;

const USERS = [
  { email: "admin@institution.edu", password: "Admin@12345", role: "ADMIN" },
  { email: "hod.cse@institution.edu", password: "Hod@12345", role: "HOD" },
  { email: "advisor.cse@institution.edu", password: "Advisor@12345", role: "ADVISOR" },
  { email: "staff.cse@institution.edu", password: "Staff@12345", role: "STAFF" },
  { email: "student.cse@institution.edu", password: "Student@12345", role: "STUDENT" },
];

const FLOWS = {
  ADMIN: ["/admin/dashboard", "/admin/departments", "/admin/hods", "/admin/users?limit=20"],
  HOD: ["/hod/dashboard", "/hod/classrooms?limit=20", "/hod/advisors?limit=20"],
  ADVISOR: ["/advisor/dashboard", "/advisor/students?limit=20", "/advisor/subjects?limit=20", "/advisor/fees?limit=20"],
  STAFF: ["/staff/dashboard", "/staff/subjects?limit=20", "/staff/approvals?status=pending&limit=20"],
  STUDENT: ["/student/dashboard", "/student/subjects?limit=20", "/student/status"],
};

async function login(u, base) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    });
    const ms = performance.now() - t0;
    const setCookie = res.headers.get("set-cookie") || "";
    const m = setCookie.match(/access_token=([^;]+)/);
    return { ok: res.ok, ms, token: m ? m[1] : null, status: res.status };
  } catch (e) {
    return { ok: false, ms: performance.now() - t0, token: null, status: 0, err: String(e).slice(0, 80) };
  }
}

async function get(token, path, base) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // drain body so timings reflect full response
    await res.arrayBuffer();
    return { ok: res.status < 500, status: res.status, ms: performance.now() - t0, path };
  } catch (e) {
    return { ok: false, status: 0, ms: performance.now() - t0, path, err: String(e).slice(0, 80) };
  }
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function vu(id, stopAt, stats) {
  const u = USERS[id % USERS.length];
  const base = BASES[id % BASES.length];
  const paths = FLOWS[u.role];
  const li = await login(u, base);
  stats.logins.push(li.ms);
  if (!li.ok || !li.token) {
    stats.loginFail++;
    stats.loginFailDetail = stats.loginFailDetail || {};
    const k = li.err ? `ERR ${li.err}` : `HTTP ${li.status}`;
    stats.loginFailDetail[k] = (stats.loginFailDetail[k] || 0) + 1;
    return;
  }
  let i = 0;
  while (Date.now() < stopAt) {
    const r = await get(li.token, paths[i % paths.length], base);
    stats.req.push(r.ms);
    stats.byPath[r.path] = stats.byPath[r.path] || [];
    stats.byPath[r.path].push(r.ms);
    if (!r.ok) stats.errors.push(`${r.status} ${r.path}`);
    i++;
  }
  stats.requests += i;
}

async function main() {
  console.log(`loadtest: ${VUS} VUs x ${SECS}s against ${BASE}`);
  const stats = { req: [], logins: [], byPath: {}, errors: [], requests: 0, loginFail: 0 };
  const stopAt = Date.now() + SECS * 1000;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: VUS }, (_, i) => vu(i, stopAt, stats)));
  const secs = (Date.now() - t0) / 1000;
  stats.req.sort((a, b) => a - b);
  stats.logins.sort((a, b) => a - b);
  console.log(`requests: ${stats.requests} in ${secs.toFixed(1)}s = ${(stats.requests / secs).toFixed(1)} rps`);
  console.log(`login: n=${stats.logins.length} fail=${stats.loginFail} p50=${pct(stats.logins, 50).toFixed(0)}ms p95=${pct(stats.logins, 95).toFixed(0)}ms`);
  if (stats.loginFail > 0) console.log("login failures:", JSON.stringify(stats.loginFailDetail));
  console.log(`api: n=${stats.req.length} p50=${pct(stats.req, 50).toFixed(0)}ms p95=${pct(stats.req, 95).toFixed(0)}ms p99=${pct(stats.req, 99).toFixed(0)}ms`);
  console.log("per-endpoint p95:");
  for (const [p, arr] of Object.entries(stats.byPath)) {
    arr.sort((a, b) => a - b);
    console.log(`  p95=${pct(arr, 95).toFixed(0)}ms n=${arr.length} ${p}`);
  }
  const errCount = stats.errors.length;
  console.log(`errors (5xx/network): ${errCount} (${((errCount / Math.max(1, stats.requests)) * 100).toFixed(2)}%)`);
  for (const e of [...new Set(stats.errors)].slice(0, 5)) console.log("  ex:", e);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
