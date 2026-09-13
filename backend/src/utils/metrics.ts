import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

/**
 * Minimal in-process observability (no vendor dependency).
 * Aggregates only — no PII, no tokens, no request bodies, no IPs.
 * Each backend instance exposes its own counters via GET /metrics;
 * aggregation across instances is the scraper's job.
 */

const LATENCY_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const SLOW_REQUEST_MS = 1000;

interface MetricsState {
  startedAt: string;
  requestsTotal: number;
  byStatus: { "2xx": number; "4xx": number; "5xx": number; other: number };
  latencySumMs: number;
  latencyBuckets: number[];
  slowRequests: number;
  authFailures: number;
  rateLimitHits: number;
  dbSlowQueries: number;
}

const state: MetricsState = {
  startedAt: new Date().toISOString(),
  requestsTotal: 0,
  byStatus: { "2xx": 0, "4xx": 0, "5xx": 0, other: 0 },
  latencySumMs: 0,
  latencyBuckets: new Array(LATENCY_BUCKETS_MS.length + 1).fill(0),
  slowRequests: 0,
  authFailures: 0,
  rateLimitHits: 0,
  dbSlowQueries: 0,
};

let loopMonitor: IntervalHistogram | null = null;
try {
  loopMonitor = monitorEventLoopDelay({ resolution: 20 });
  loopMonitor.enable();
} catch {
  loopMonitor = null;
}

function bucketIndex(ms: number): number {
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i++) {
    if (ms <= LATENCY_BUCKETS_MS[i]) return i;
  }
  return LATENCY_BUCKETS_MS.length;
}

export function recordRequest(status: number, latencyMs: number, url: string): void {
  state.requestsTotal++;
  if (status >= 200 && status < 300) state.byStatus["2xx"]++;
  else if (status >= 400 && status < 500) state.byStatus["4xx"]++;
  else if (status >= 500) state.byStatus["5xx"]++;
  else state.byStatus.other++;

  state.latencySumMs += latencyMs;
  state.latencyBuckets[bucketIndex(latencyMs)]++;

  if (latencyMs > SLOW_REQUEST_MS) state.slowRequests++;
  if (status === 401 && url.includes("/auth/")) state.authFailures++;
  if (status === 429) state.rateLimitHits++;
}

export function recordSlowQuery(): void {
  state.dbSlowQueries++;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// Exact percentiles need samples; keep a small rolling reservoir instead of
// unbounded growth (bounded memory by design).
const reservoir: number[] = [];
const RESERVOIR_MAX = 2048;
let reservoirCursor = 0;

export function recordLatencySample(ms: number): void {
  if (reservoir.length < RESERVOIR_MAX) {
    reservoir.push(ms);
  } else {
    reservoir[reservoirCursor % RESERVOIR_MAX] = ms;
    reservoirCursor++;
  }
}

export function metricsSnapshot() {
  const sorted = [...reservoir].sort((a, b) => a - b);
  const avg = state.requestsTotal > 0 ? state.latencySumMs / state.requestsTotal : 0;
  return {
    service: "academic-management-backend",
    startedAt: state.startedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    eventLoopDelayMs: loopMonitor
      ? {
          p50: Number((loopMonitor.percentile(50) / 1e6).toFixed(2)),
          p99: Number((loopMonitor.percentile(99) / 1e6).toFixed(2)),
        }
      : null,
    requests: {
      total: state.requestsTotal,
      byStatus: { ...state.byStatus },
      latencyMs: {
        avg: Number(avg.toFixed(2)),
        p50: Number(percentile(sorted, 50).toFixed(2)),
        p95: Number(percentile(sorted, 95).toFixed(2)),
        p99: Number(percentile(sorted, 99).toFixed(2)),
        buckets: Object.fromEntries(
          LATENCY_BUCKETS_MS.map((b, i) => [`<=${b}`, state.latencyBuckets[i]])
        ),
        overflow: state.latencyBuckets[state.latencyBuckets.length - 1],
      },
      slowRequestsOverMs: { threshold: SLOW_REQUEST_MS, count: state.slowRequests },
    },
    auth: { failures401: state.authFailures },
    rateLimit: { hits429: state.rateLimitHits },
    database: { slowQueries: state.dbSlowQueries },
  };
}
