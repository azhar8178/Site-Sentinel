#!/usr/bin/env node

const fs = require("fs");
const https = require("https");
const http = require("http");
const os = require("os");
const { execSync } = require("child_process");
const crypto = require("crypto");

const API_URL = (process.env.MONITOR_API_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.MONITOR_API_KEY;
const INTERVAL = parseInt(process.env.MONITOR_INTERVAL || "30", 10) * 1000;
const OPENSEARCH_URL =
  process.env.MONITOR_OPENSEARCH_URL ||
  "https://vpc-magento-prod-nzaysstzukhdmqqtuhh6be2use.eu-west-2.es.amazonaws.com";
const OPENSEARCH_REGION = process.env.MONITOR_OPENSEARCH_REGION || "eu-west-2";
const OPENSEARCH_AUTH = process.env.MONITOR_OPENSEARCH_AUTH || "none";

if (!API_URL || !API_KEY) {
  console.error("ERROR: MONITOR_API_URL and MONITOR_API_KEY are required.");
  console.error("  export MONITOR_API_URL=https://monit.yourdomain.com");
  console.error("  export MONITOR_API_KEY=sm_xxxx");
  process.exit(1);
}

let prevCpu = null;
let prevNet = null;
let lastLogSnapshotAt = 0;

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

function getNginxStatus() {
  const isRunning = !!(
    exec("systemctl is-active --quiet nginx 2>/dev/null && echo yes") ||
    exec("pidof nginx 2>/dev/null | head -c1")
  );

  const statusOutput =
    exec("curl -sf --max-time 3 http://127.0.0.1/nginx_status 2>/dev/null") ||
    exec("curl -sf --max-time 3 http://127.0.0.1:8080/nginx_status 2>/dev/null");

  if (!statusOutput) return { isRunning };

  const activeConn = statusOutput.match(/Active connections:\s*(\d+)/);
  const serverLine = statusOutput.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/m);
  const rwLine = statusOutput.match(/Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/);

  return {
    isRunning: true,
    activeConnections: activeConn ? parseInt(activeConn[1], 10) : null,
    accepts: serverLine ? parseInt(serverLine[1], 10) : null,
    handled: serverLine ? parseInt(serverLine[2], 10) : null,
    requests: serverLine ? parseInt(serverLine[3], 10) : null,
    reading: rwLine ? parseInt(rwLine[1], 10) : null,
    writing: rwLine ? parseInt(rwLine[2], 10) : null,
    waiting: rwLine ? parseInt(rwLine[3], 10) : null,
  };
}

function getVarnishStats() {
  const isRunning = !!(
    exec("systemctl is-active --quiet varnish 2>/dev/null && echo yes") ||
    exec("pidof varnishd 2>/dev/null | head -c1")
  );

  // Read the complete stats report. Some Varnish 6.x installations do not
  // return output for the comma-separated -f form, even though varnishstat -1
  // exposes all counters correctly.
  const statsOutput = exec("varnishstat -1 2>/dev/null");

  if (!statsOutput) return { isRunning };

  const readCounter = (name) => {
    const match = statsOutput.match(new RegExp(`^MAIN\\.${name}\\s+(\\d+)`, "m"));
    return match ? parseInt(match[1], 10) : null;
  };

  const hits = readCounter("cache_hit");
  const misses = readCounter("cache_miss");
  const clientReqs = readCounter("client_req");

  if (hits === null && misses === null && clientReqs === null) {
    return {
      isRunning,
      error: "Varnish is running but returned no cache counters",
    };
  }

  let hitRate = null;
  if (hits !== null && misses !== null && hits + misses > 0) {
    hitRate = Math.round((hits / (hits + misses)) * 100);
  }

  return {
    isRunning: isRunning || hits !== null,
    cacheHits: hits,
    cacheMisses: misses,
    clientRequests: clientReqs,
    hitRate,
  };
}

function requestText(urlString, options = {}) {
  const url = new URL(urlString);
  const isHttps = url.protocol === "https:";
  const mod = isHttps ? https : http;

  return new Promise((resolve) => {
    const req = mod.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname || "/"}${url.search}`,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode || 0, body })
        );
      }
    );

    req.on("error", (error) =>
      resolve({ statusCode: 0, body: "", error: error.message })
    );
    req.setTimeout(options.timeout || 5000, () => {
      req.destroy();
      resolve({ statusCode: 0, body: "", error: "request timed out" });
    });
    req.end();
  });
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function signAwsRequest(url, region, credentials) {
  const service = "es";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const host = url.host;
  const canonicalUri =
    (url.pathname || "/")
      .split("/")
      .map((part) => awsEncode(part))
      .join("/") || "/";
  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
  const sessionToken = credentials.Token || credentials.SessionToken;
  const signedHeaders = sessionToken
    ? "host;x-amz-date;x-amz-security-token"
    : "host;x-amz-date";
  const canonicalHeaders = sessionToken
    ? `host:${host}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`
    : `host:${host}\nx-amz-date:${amzDate}\n`;
  const payloadHash = crypto.createHash("sha256").update("").digest("hex");
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");
  const hmac = (key, value) =>
    crypto.createHmac("sha256", key).update(value).digest();
  const dateKey = hmac(`AWS4${credentials.SecretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, service);
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return {
    Host: host,
    "X-Amz-Date": amzDate,
    ...(sessionToken ? { "X-Amz-Security-Token": sessionToken } : {}),
    Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function getAwsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (accessKeyId && secretAccessKey) {
    return { AccessKeyId: accessKeyId, SecretAccessKey: secretAccessKey, Token: sessionToken };
  }

  const tokenResponse = await requestText("http://169.254.169.254/latest/api/token", {
    method: "PUT",
    headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" },
    timeout: 1500,
  });
  if (tokenResponse.statusCode !== 200 || !tokenResponse.body) return null;

  const metadataHeaders = { "X-aws-ec2-metadata-token": tokenResponse.body };
  const roleResponse = await requestText(
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    { headers: metadataHeaders, timeout: 1500 }
  );
  if (roleResponse.statusCode !== 200 || !roleResponse.body.trim()) return null;

  const credentialsResponse = await requestText(
    `http://169.254.169.254/latest/meta-data/iam/security-credentials/${encodeURIComponent(roleResponse.body.trim())}`,
    { headers: metadataHeaders, timeout: 1500 }
  );
  if (credentialsResponse.statusCode !== 200) return null;

  try {
    const credentials = JSON.parse(credentialsResponse.body);
    if (!credentials.AccessKeyId || !credentials.SecretAccessKey) return null;
    return credentials;
  } catch {
    return null;
  }
}

async function getRemoteOpenSearchStatus(endpoint) {
  const url = new URL(endpoint);
  url.pathname = "/_cluster/health";
  url.search = "";
  const region = OPENSEARCH_REGION;
  const auth = OPENSEARCH_AUTH.toLowerCase();
  let headers = {};

  if (auth === "basic") {
    const username = process.env.MONITOR_OPENSEARCH_USERNAME;
    const password = process.env.MONITOR_OPENSEARCH_PASSWORD;
    if (!username || !password) {
      return { isRunning: false, error: "Basic auth is configured but credentials are missing" };
    }
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  } else if (auth === "iam") {
    const credentials = await getAwsCredentials();
    if (!credentials) {
      return { isRunning: false, error: "AWS IAM credentials unavailable on this host" };
    }
    headers = signAwsRequest(url, region, credentials);
  } else if (auth !== "none") {
    return {
      isRunning: false,
      error: `Unsupported OpenSearch auth mode: ${OPENSEARCH_AUTH}`,
    };
  }

  const response = await requestText(url.href, { headers, timeout: 7000 });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    return {
      isRunning: false,
      error: response.statusCode
        ? `OpenSearch health check returned HTTP ${response.statusCode}`
        : response.error || "OpenSearch health check failed",
    };
  }

  try {
    const health = JSON.parse(response.body);
    return {
      isRunning: true,
      status: health.status,
      numberOfNodes: health.number_of_nodes,
      numberOfDataNodes: health.number_of_data_nodes,
      activeShards: health.active_shards,
      relocatingShards: health.relocating_shards,
      unassignedShards: health.unassigned_shards,
    };
  } catch {
    return { isRunning: false, error: "OpenSearch returned invalid health data" };
  }
}

async function getElasticsearchStatus() {
  const remoteEndpoint =
    process.env.MONITOR_ELASTICSEARCH_URL || OPENSEARCH_URL;
  if (remoteEndpoint) {
    return getRemoteOpenSearchStatus(remoteEndpoint);
  }

  const isRunning = !!(
    exec("systemctl is-active --quiet elasticsearch 2>/dev/null && echo yes") ||
    exec("curl -sf --max-time 2 http://127.0.0.1:9200/ 2>/dev/null | head -c1")
  );

  const healthOutput = exec(
    "curl -sf --max-time 5 http://127.0.0.1:9200/_cluster/health 2>/dev/null"
  );

  if (!healthOutput) return { isRunning };

  try {
    const health = JSON.parse(healthOutput);
    return {
      isRunning: true,
      status: health.status,
      numberOfNodes: health.number_of_nodes,
      numberOfDataNodes: health.number_of_data_nodes,
      activeShards: health.active_shards,
      relocatingShards: health.relocating_shards,
      unassignedShards: health.unassigned_shards,
    };
  } catch {
    return { isRunning };
  }
}

function getSslExpiry() {
  const domainsEnv = process.env.MONITOR_SSL_DOMAINS || "";
  const domains = domainsEnv
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  if (domains.length === 0) return null;

  const results = [];
  for (const domain of domains) {
    const endDate = exec(
      `echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null`
    );
    if (!endDate) {
      results.push({ domain, error: "Could not fetch certificate" });
      continue;
    }
    const match = endDate.match(/notAfter=(.*)/);
    if (!match) {
      results.push({ domain, error: "Could not parse expiry" });
      continue;
    }
    const expiresAt = new Date(match[1]);
    const daysRemaining = Math.floor(
      (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    results.push({
      domain,
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
      isExpired: daysRemaining < 0,
      isExpiringSoon: daysRemaining >= 0 && daysRemaining <= 30,
    });
  }

  return results.length > 0 ? results : null;
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

function sanitizeLog(value) {
  return value
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[=:]\s*)["']?[^"'\\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:password|passwd|token|api[_-]?key|secret)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]");
}

function readLogCommand(command, maxChars = 12000) {
  const output = exec(command);
  if (!output) return "";
  return sanitizeLog(output).slice(-maxChars);
}

function getLogSnapshot() {
  const sources = {
    journal: readLogCommand(
      "journalctl --since '5 minutes ago' --no-pager -n 160 -u nginx -u varnish -u mysql -u mariadb -u opensearch -u elasticsearch 2>/dev/null"
    ),
    nginxError: readLogCommand("tail -n 160 /var/log/nginx/error.log 2>/dev/null"),
    varnish: readLogCommand("tail -n 160 /var/log/varnish/varnish.log 2>/dev/null"),
    phpFpm: readLogCommand(
      "sh -c 'for f in /var/log/php*-fpm.log /var/log/php*/fpm-php*.log; do [ -f \"$f\" ] && tail -n 80 \"$f\"; done' 2>/dev/null"
    ),
    magento: readLogCommand(
      "sh -c 'for f in /var/www/html/var/log/system.log /var/www/html/var/log/exception.log /var/www/html/var/log/debug.log; do [ -f \"$f\" ] && tail -n 120 \"$f\"; done' 2>/dev/null"
    ),
    kernel: readLogCommand(
      "journalctl -k --since '5 minutes ago' --no-pager -p warning..alert -n 120 2>/dev/null"
    ),
    failedServices: readLogCommand(
      "systemctl --failed --no-legend --no-pager 2>/dev/null"
    ),
  };

  const totalChars = Object.values(sources).reduce((sum, value) => sum + value.length, 0);
  if (totalChars === 0) return null;

  return {
    capturedAt: new Date().toISOString(),
    window: "last 5 minutes for journal/kernel; recent tail for file logs",
    sources,
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
  const topProcesses = getTopProcesses();
  const phpFpm = getPhpFpmStatus();
  const mysql = getMySqlStats();
  const connCount = getConnectionCount();
  const procCount = getProcessCount();
  const httpConns = getHttpConnections();
  const nginx = getNginxStatus();
  const varnish = getVarnishStats();
  const elasticsearch = await getElasticsearchStatus();
  const sslExpiry = getSslExpiry();

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
    nginx,
    varnish,
    elasticsearch,
    sslExpiry,
  };

  if (Date.now() - lastLogSnapshotAt >= 5 * 60 * 1000) {
    const logSnapshot = getLogSnapshot();
    if (logSnapshot) {
      data.logSnapshot = logSnapshot;
      lastLogSnapshotAt = Date.now();
    }
  }

  const ok = await postMetrics(data);
  if (ok) {
    const memPct =
      mem.total > 0 ? ((mem.used / mem.total) * 100).toFixed(1) : "0";
    const diskPct =
      disk.total > 0 ? ((disk.used / disk.total) * 100).toFixed(1) : "0";
    const nginxStr = nginx.isRunning ? `Nginx:up(${nginx.activeConnections ?? "?"}conn)` : "Nginx:down";
    const varnishStr = varnish.isRunning ? `Varnish:up(${varnish.hitRate ?? "?"}%hit)` : "Varnish:not-running";
    console.log(
      `[${new Date().toISOString()}] CPU: ${cpu}% | Mem: ${memPct}% | Disk: ${diskPct}% | Load: ${load.m1} | PHP: ${phpFpm.active}/${phpFpm.total} | ${nginxStr} | ${varnishStr}`
    );
  }
}

const AGENT_VERSION = "3.4.0";
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
  `  Features: CPU, Memory, Disk, Network, Load, PHP-FPM, MySQL, Nginx, Varnish, OpenSearch, SSL`
);
console.log(`  OpenSearch: ${OPENSEARCH_URL} (${OPENSEARCH_AUTH} auth)`);
if (process.env.MONITOR_SSL_DOMAINS) {
  console.log(`  SSL domains: ${process.env.MONITOR_SSL_DOMAINS}`);
} else {
  console.log(`  SSL: set MONITOR_SSL_DOMAINS=domain1.com,domain2.com to enable SSL expiry checks`);
}

getCpuUsage();

setTimeout(() => {
  collect();
  checkForUpdates();
  setInterval(collect, INTERVAL);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
}, 1000);
