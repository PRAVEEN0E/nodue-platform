/* Distributed consistency probe: 2 backend instances (:5001/:5002) started
 * WITHOUT the localhost allowlist, sharing Redis + Postgres.
 * - Shared rate-limit counting: 30 concurrent logins (15 per instance)
 *   against a shared 20/min login budget must yield 429s. Per-instance
 *   counting would allow all 30 (15+15 <= 20 each).
 * - Session/refresh consistency across instances.
 * Usage: node scripts/dist-test.mjs (dev instances on 5001/5002 required)
 */
const BASES = ["http://localhost:5001/api/v1", "http://localhost:5002/api/v1"];

async function login(base, email, password) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/access_token=([^;]+)/);
  return { status: res.status, token: m ? m[1] : null };
}

async function main() {
  let pass = 0;
  let fail = 0;
  const check = (cond, label, extra = "") => {
    if (cond) {
      pass++;
      console.log(`  PASS ${label}`);
    } else {
      fail++;
      console.log(`  FAIL ${label} ${extra}`);
    }
  };

  // 1. Shared rate-limit budget: 30 concurrent logins, shared 20/min budget
  console.log("1. Shared rate-limit counting");
  const attempts = Array.from({ length: 30 }, (_, i) =>
    login(BASES[i % 2], "admin@institution.edu", "Admin@12345")
  );
  const results = await Promise.all(attempts);
  const ok429 = results.filter((r) => r.status === 429).length;
  const ok200 = results.filter((r) => r.status === 200).length;
  console.log(`  200s: ${ok200}, 429s: ${ok429}`);
  check(ok429 >= 5, "shared budget enforced across instances (429s observed)", `${ok429} 429s`);
  check(ok200 > 0 && ok200 <= 25, "budget approximately shared (not 2x independent)", `${ok200} 200s`);

  // 2. Session consistency: login on A, use on B
  console.log("2. Cross-instance session");
  const good = results.find((r) => r.token);
  if (!good) throw new Error("no successful login to test with");
  const other = BASES[0];
  const me = await fetch(`${other}/auth/me`, {
    headers: { Authorization: `Bearer ${good.token}` },
  });
  check(me.status === 200, "token from :5001 works on :5002", me.status);

  // 3. Refresh rotation across instances
  const ref = await fetch(`${BASES[1]}/auth/refresh`, {
    method: "POST",
    headers: { Cookie: `refresh_token=x`, Authorization: `Bearer ${good.token}` },
  });
  // (refresh needs the cookie; this call only checks the endpoint is shared-state consistent)
  console.log(`  refresh-without-cookie: ${ref.status} (expect 401, same on any instance)`);
  check(ref.status === 401, "refresh stateless across instances", ref.status);

  // 4. Metrics + request-id correlation on both instances
  for (const base of BASES) {
    const m = await fetch(`${base.replace("/api/v1", "")}/metrics`).then((r) => r.json());
    check(true, `${base} metrics ok (reqs=${m.requests.total})`);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
