#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");
const { execSync } = require("child_process");

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

function exec(cmd) {
  try {
    return execSync(cmd, { timeout: 5000, encoding: "utf-8" }).trim();
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

function getTopProcesses() {
  const output = exec("ps aux --sort=-%cpu --no-headers | head -10");
  if (!output) return [];

  return output
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const user = parts[0];
      const pid = parseInt(parts[1], 10);
      const cpu = parseFloat(parts[2]) || 0;
      const mem = parseFloat(parts[3]) || 0;
      const rss = parseInt(parts[5], 10) * 1024;
      const command = parts.slice(10).join(" ").substring(0, 200);
      return { pid, user, cpu, mem, rss, command };
    });
}

function getPhpFpmStatus() {
  const result = { active: 0, idle: 0, total: 0, maxChildren: 0 };

  const phpProcesses = exec("ps aux | grep 'php-fpm' | grep -v grep");
  if (phpProcesses) {
    const lines = phpProcesses.split("\n").filter((l) => l.trim());
    result.total = lines.length;
    result.active = lines.filter(
      (l) => !l.includes("pool") || !l.includes("idle")
    ).length;
    result.idle = result.total - result.active;
  }

  const statusOutput = exec(
    "curl -s http://127.0.0.1/fpm-status?json 2>/dev/null || curl -s http://127.0.0.1:9000/fpm-status?json 2>/dev/null"
  );
  if (statusOutput) {
    try {
      const status = JSON.parse(statusOutput);
      result.active = status["active processes"] || result.active;
      result.idle = status["idle processes"] || result.idle;
      result.total = status["total processes"] || result.total;
      result.maxChildren =
        status["max children reached"] || result.maxChildren;
    } catch {}
  }

  if (result.total === 0) {
    const conf = exec(
      "grep -r 'pm.max_children' /etc/php*/*/fpm/pool.d/ 2>/dev/null | head -1"
    );
    if (conf) {
      const m = conf.match(/=\s*(\d+)/);
      if (m) result.maxChildren = parseInt(m[1], 10);
    }
  }

  return result;
}

function getMySqlStats() {
  const output = exec(
    "mysqladmin status 2>/dev/null || mysql -e 'SHOW STATUS' 2>/dev/null | head -5"
  );
  if (!output) return null;

  const threads = output.match(/Threads:\s*(\d+)/);
  const questions = output.match(/Questions:\s*(\d+)/);
  const slowQueries = output.match(/Slow queries:\s*(\d+)/);

  if (!threads) return null;

  return {
    threads: parseInt(threads[1], 10) || 0,
    questions: questions ? parseInt(questions[1], 10) : 0,
    slowQueries: slowQueries ? parseInt(slowQueries[1], 10) : 0,
  };
}

function getConnectionCount() {
  const output = exec("ss -tun state established 2>/dev/null | wc -l");
  if (!output) return 0;
  return Math.max(0, parseInt(output, 10) - 1);
}

function getProcessCount() {
  const output = exec("ls -1 /proc | grep -c '^[0-9]' 2>/dev/null");
  if (!output) return 0;
  return parseInt(output, 10) || 0;
}

function getHttpConnections() {
  const output = exec(
    "ss -tun state established '( dport = :80 or dport = :443 or sport = :80 or sport = :443 )' 2>/dev/null | wc -l"
  );
  if (!output) return 0;
  return Math.max(0, parseInt(output, 10) - 1);
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
  const topProcesses = getTopProcesses();
  const phpFpm = getPhpFpmStatus();
  const mysql = getMySqlStats();
  const connCount = getConnectionCount();
  const procCount = getProcessCount();
  const httpConns = getHttpConnections();

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
    topProcesses,
    phpFpm,
    mysql,
    connectionCount: connCount,
    processCount: procCount,
    httpConnectionCount: httpConns,
  };

  const ok = await postMetrics(data);
  if (ok) {
    const memPct =
      mem.total > 0 ? ((mem.used / mem.total) * 100).toFixed(1) : "0";
    const diskPct =
      disk.total > 0 ? ((disk.used / disk.total) * 100).toFixed(1) : "0";
    console.log(
      `[${new Date().toISOString()}] CPU: ${cpu}% | Mem: ${memPct}% | Disk: ${diskPct}% | Load: ${load.m1} | PHP: ${phpFpm.active}/${phpFpm.total} | Conns: ${connCount} | Procs: ${procCount}`
    );
  }
}

const AGENT_VERSION = "2.0.0";
const UPDATE_CHECK_INTERVAL = 3600000;
let lastUpdateCheck = 0;

function checkForUpdates() {
  if (Date.now() - lastUpdateCheck < UPDATE_CHECK_INTERVAL) return;
  lastUpdateCheck = Date.now();

  const url = new URL(`${API_URL}/api/agent/version`);
  const isHttps = url.protocol === "https:";
  const mod = isHttps ? https : http;

  const req = mod.get(url.href, (res) => {
    let data = "";
    res.on("data", (d) => (data += d));
    res.on("end", () => {
      try {
        const info = JSON.parse(data);
        if (info.version && info.version !== AGENT_VERSION) {
          console.log(
            `[UPDATE] New agent version available: ${info.version} (current: ${AGENT_VERSION})`
          );
          console.log(
            `[UPDATE] Run: curl -sf "${API_URL}/api/agent/script" -H "x-api-key: $MONITOR_API_KEY" -o /opt/monitor-agent/monitor-agent.js && sudo systemctl restart monitor-agent`
          );
        }
      } catch {}
    });
  });
  req.on("error", () => {});
  req.setTimeout(5000, () => req.destroy());
}

console.log(`Site Sentinel Monitor Agent v${AGENT_VERSION}`);
console.log(`  API: ${API_URL}`);
console.log(`  Interval: ${INTERVAL / 1000}s`);
console.log(
  `  Features: CPU, Memory, Disk, Network, Load, Top Processes, PHP-FPM, MySQL, Connections`
);

getCpuUsage();

setTimeout(() => {
  collect();
  checkForUpdates();
  setInterval(collect, INTERVAL);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
}, 1000);
