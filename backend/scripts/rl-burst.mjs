/* Burst 150 rapid GETs at one instance; expect 429s past the global 100/min. */
const N = 150;
const codes = await Promise.all(
  Array.from({ length: N }, () =>
    fetch("http://localhost:5001/health").then((r) => r.status).catch(() => 0)
  )
);
const counts = {};
for (const c of codes) counts[c] = (counts[c] || 0) + 1;
console.log(JSON.stringify(counts));
