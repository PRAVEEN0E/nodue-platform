/* Probe: is rate limiting active on :5001? 120 rapid GETs, count 429s. */
const N = 120;
const codes = await Promise.all(
  Array.from({ length: N }, () =>
    fetch("http://localhost:5001/health").then((r) => r.status).catch(() => 0)
  )
);
const counts = {};
for (const c of codes) counts[c] = (counts[c] || 0) + 1;
console.log(JSON.stringify(counts));
