import { prometheus } from "@hono/prometheus";
import { Counter, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const { printMetrics } = prometheus({
  registry: registry,
  prefix: "library_",
  collectDefaultMetrics: true,
});

export const workerStatsCounter = new Counter({
  name: "library_worker_stats",
  help: "Stats for each worker",
  labelNames: ["worker_name", "status"],
});

export const crawlerStatusCodeCounter = new Counter({
  name: "library_crawler_status_codes_total",
  help: "HTTP status codes encountered during crawling",
  labelNames: ["status_code", "proxy"],
});

export const bookmarkCrawlLatencyHistogram = new Histogram({
  name: "library_bookmark_crawl_latency_seconds",
  help: "Latency from bookmark creation to crawl completion (excludes recrawls and imports)",
  buckets: [
    0.1, 0.25, 0.5, 1, 2.5, 5, 7.5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300,
    600, 900, 1200,
  ],
});

registry.registerMetric(workerStatsCounter);
registry.registerMetric(crawlerStatusCodeCounter);
registry.registerMetric(bookmarkCrawlLatencyHistogram);
