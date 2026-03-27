#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");

const API_URL = process.env.MONITOR_API_URL;
const API_KEY = process.env.MONITOR_API_KEY;
const INTERVAL = parseInt(process.env.MONITOR_INTERVAL || "30", 10) * 1000;

if (!API_URL || !API_KEY) {
  console.error("ERROR: MONITOR_API_URL and MONITOR_API_KEY are required.");
  console.error("  export MONITOR_API_URL=https://monit.yourdomain.com");
  console.error("  export MONITOR_API_KEY=sm_xxxx");
  process.exit(1);
}

let prevCpu = null;
let prevNet = null;

function readFile(path) {
  try {
    return fs.readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function getCpuUsage() {
  const stat = readFile("/proc/stat");
  if (!stat) return 0;

  const line = stat.split("\n")[0];
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);

  if (!prevCpu) {
    prevCpu = { idle, total };
    return 0;
  }

  const diffIdle = idle - prevCpu.idle;
  const diffTotal = total - prevCpu.total;
  prevCpu = { idle, total };

  if (diffTotal === 0) return 0;
  return Math.round(((diffTotal - diffIdle) / diffTotal) * 10000) / 100;
}

function getMemory() {
  const meminfo = readFile("/proc/meminfo");
  if (!meminfo) return { used: 0, total: 0 };

  const parse = (key) => {
    const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`));
    return match ? parseInt(match[1], 10) * 1024 : 0;
  };

  const total = parse("MemTotal");
  const free = parse("MemFree");
  const buffers = parse("Buffers");
  const cached = parse("Cached");
  const used = total - free - buffers - cached;

  return { used: Math.max(0, used), total };
}

function getDisk() {
  try {
    const stats = fs.statfsSync("/");
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bavail;
    return { used: total - free, total };
  } catch {
    return { used: 0, total: 0 };
  }
}

function getNetwork() {
  const netDev = readFile("/proc/net/dev");
  if (!netDev) return { rx: 0, tx: 0 };

  let totalRx = 0;
  let totalTx = 0;

  const lines = netDev.split("\n").slice(2);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (!parts[0] || parts[0] === "lo:") continue;
    totalRx += parseInt(parts[1], 10) || 0;
    totalTx += parseInt(parts[9], 10) || 0;
  }

  return { rx: totalRx, tx: totalTx };
}

function getLoadAvg() {
  const loadavg = readFile("/proc/loadavg");
  if (!loadavg) {
    const avg = os.loadavg();
    return { m1: avg[0], m5: avg[1], m15: avg[2] };
  }

  const parts = loadavg.split(/\s+/);
  return {
    m1: parseFloat(parts[0]) || 0,
    m5: parseFloat(parts[1]) || 0,
    m15: parseFloat(parts[2]) || 0,
  };
}

function postMetrics(data) {
  const url = new URL(`${API_URL}/api/servers/report`);
  const isHttps = url.protocol === "https:";
  const mod = isHttps ? https : http;

  const body = JSON.stringify(data);

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "Content-Length": Buffer.byteLength(body),
    },
  };

  return new Promise((resolve) => {
    const req = mod.request(options, (res) => {
      let chunks = "";
      res.on("data", (d) => (chunks += d));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          console.error(`Report failed: HTTP ${res.statusCode} - ${chunks}`);
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.error(`Report error: ${err.message}`);
      resolve(false);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.error("Report timeout");
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

async function collect() {
  const cpu = getCpuUsage();
  const mem = getMemory();
  const disk = getDisk();
  const net = getNetwork();
  const load = getLoadAvg();

  const data = {
    cpuPercent: cpu,
    memUsedBytes: mem.used,
    memTotalBytes: mem.total,
    diskUsedBytes: disk.used,
    diskTotalBytes: disk.total,
    netRxBytes: net.rx,
    netTxBytes: net.tx,
    loadAvg1m: load.m1,
    loadAvg5m: load.m5,
    loadAvg15m: load.m15,
  };

  const ok = await postMetrics(data);
  if (ok) {
    const memPct = mem.total > 0 ? ((mem.used / mem.total) * 100).toFixed(1) : "0";
    const diskPct = disk.total > 0 ? ((disk.used / disk.total) * 100).toFixed(1) : "0";
    console.log(
      `[${new Date().toISOString()}] CPU: ${cpu}% | Mem: ${memPct}% | Disk: ${diskPct}% | Load: ${load.m1}`
    );
  }
}

console.log(`Site Monitor Agent started`);
console.log(`  API: ${API_URL}`);
console.log(`  Interval: ${INTERVAL / 1000}s`);

getCpuUsage();

setTimeout(() => {
  collect();
  setInterval(collect, INTERVAL);
}, 1000);
