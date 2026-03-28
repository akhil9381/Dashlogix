import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import https from "https";
import http from "http";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";

import Log from "./models/Log.js";
import AlertRule from "./models/AlertRule.js";
import AlertEvent from "./models/AlertEvent.js";
import User from "./models/User.js";
import SearchHistory from "./models/SearchHistory.js";
import UserActivity from "./models/UserActivity.js";
import {
  parseSimpleQuery,
  buildTimeRangeFilter,
  classifyLogLevel,
  resolveSearchOptions,
} from "./utils/queryTranslator.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 5001);
const API_PREFIX = "/api";

const SPLUNK_SCHEME = process.env.SPLUNK_SCHEME || "https";
const SPLUNK_HOST = process.env.SPLUNK_HOST;
const SPLUNK_PORT = process.env.SPLUNK_PORT;
const SPLUNK_BASE = `${SPLUNK_SCHEME}://${SPLUNK_HOST}:${SPLUNK_PORT}`;

const COLLECT_INTERVAL_MS = Number(process.env.COLLECT_INTERVAL_MS || 5000);
const ALERT_TICK_MS = Number(process.env.ALERT_TICK_MS || 60000);
const REALTIME_POLL_MS = Number(process.env.REALTIME_POLL_MS || 3000);
const MAX_FETCH_LIMIT = Math.min(
  Math.max(Number(process.env.SPLUNK_COLLECT_LIMIT || 200), 1),
  1000
);
const JWT_SECRET = process.env.JWT_SECRET || "dashlogix-dev-secret-change-me";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const syncState = {
  mongoConnected: false,
  isCollecting: false,
  collectionPausedForMongo: false,
  alertSweepPausedForMongo: false,
  lastSyncAt: null,
  lastFetched: 0,
  lastIngested: 0,
  lastError: null,
  intervalMs: COLLECT_INTERVAL_MS,
  source: {
    index: process.env.SPLUNK_INDEX || "main",
    timeWindow: process.env.SPLUNK_EARLIEST || "-1h",
    maxEvents: MAX_FETCH_LIMIT,
  },
};

let mailTransporter = null;
let alertSweepRunning = false;
const realtimeState = {
  running: false,
  index: process.env.SPLUNK_INDEX || "_internal",
  limit: Math.min(MAX_FETCH_LIMIT, 100),
  pollMs: Math.max(REALTIME_POLL_MS, 1000),
  intervalId: null,
  lastError: null,
  startedAt: null,
  lastPollAt: null,
  seen: new Map(),
};
const statsCache = new Map();
const STATS_CACHE_TTL_MS = Math.max(
  Number(process.env.STATS_CACHE_TTL_MS || 10000),
  1000
);

function getStatsCacheKey(path, query = {}) {
  const params = new URLSearchParams();
  const keys = Object.keys(query || {}).sort();
  for (const key of keys) {
    if (query[key] !== undefined && query[key] !== null) {
      params.append(key, String(query[key]));
    }
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function getCachedStats(key) {
  const hit = statsCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    statsCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedStats(key, value) {
  statsCache.set(key, {
    value,
    expiresAt: Date.now() + STATS_CACHE_TTL_MS,
  });
}

function invalidateStatsCache() {
  statsCache.clear();
}

function routeBoth(method, path, handler) {
  app[method](path, handler);
  app[method](`${API_PREFIX}${path}`, handler);
}

function makeToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function parseBearer(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

async function getUserFromReq(req) {
  const token = parseBearer(req);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.sub) return null;
    const user = await User.findById(payload.sub).lean();
    return user || null;
  } catch {
    return null;
  }
}

function requireAuth(handler) {
  return async (req, res) => {
    const user = await getUserFromReq(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = user;
    return handler(req, res);
  };
}

function withMongoGuard(handler) {
  return async (req, res) => {
    if (!syncState.mongoConnected) {
      return res.status(503).json({
        error: "MongoDB is not connected",
        hint: "Check MONGO_URI and MongoDB Atlas network access, then restart backend.",
      });
    }

    try {
      await handler(req, res);
    } catch (error) {
      console.error("Request failed:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  };
}

function normalizeLog(result) {
  if (!result || typeof result !== "object") return null;

  return {
    time: result._time || result.time || new Date().toISOString(),
    host: result.host || "splunk",
    source: result.source || result.sourcetype || "unknown",
    log: result._raw || result.log || result.message || JSON.stringify(result),
  };
}

function parseSplunkResponse(rawData) {
  const logs = [];

  const pushParsed = (value) => {
    const normalized = normalizeLog(value?.result || value);
    if (normalized) logs.push(normalized);
  };

  if (typeof rawData === "string") {
    const lines = rawData
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      try {
        pushParsed(JSON.parse(line));
      } catch {
        // Ignore malformed lines from stream.
      }
    }

    return logs;
  }

  if (Array.isArray(rawData)) {
    rawData.forEach(pushParsed);
    return logs;
  }

  if (rawData && typeof rawData === "object") {
    if (Array.isArray(rawData.results)) {
      rawData.results.forEach(pushParsed);
      return logs;
    }

    if (rawData.result) {
      pushParsed(rawData.result);
      return logs;
    }

    pushParsed(rawData);
  }

  return logs;
}

function buildLocalHeartbeatLog() {
  return {
    time: new Date().toISOString(),
    host: "dashlogix",
    source: "local",
    log: "DashLogix collector heartbeat",
  };
}

async function ingestLogs(logs, queryLabel = "auto-fetch") {
  if (!Array.isArray(logs) || logs.length === 0) return 0;

  const docs = logs.map((log) => ({ ...log, query: queryLabel }));
  await Log.insertMany(docs, { ordered: false });
  invalidateStatsCache();
  return docs.length;
}

async function splunkLogin() {
  if (!SPLUNK_HOST || !SPLUNK_PORT) {
    throw new Error("Splunk host/port not configured");
  }

  const response = await axios.post(
    `${SPLUNK_BASE}/services/auth/login`,
    new URLSearchParams({
      username: process.env.SPLUNK_USERNAME,
      password: process.env.SPLUNK_PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      httpsAgent,
      responseType: "text",
    }
  );

  const match = String(response.data).match(/<sessionKey>(.*?)<\/sessionKey>/);
  if (!match) {
    throw new Error("Splunk login failed (session key missing)");
  }

  return match[1];
}

async function fetchSplunkBySearch(search, limit = MAX_FETCH_LIMIT) {
  const sessionKey = await splunkLogin();
  const finalSearch = /\|\s*head\s+\d+/i.test(search)
    ? search
    : `${search} | head ${Math.min(Math.max(Number(limit || 100), 1), 1000)}`;

  const response = await axios.post(
    `${SPLUNK_BASE}/services/search/jobs/export`,
    new URLSearchParams({
      search: finalSearch,
      output_mode: "json",
    }),
    {
      headers: {
        Authorization: `Splunk ${sessionKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      httpsAgent,
      responseType: "text",
      transformResponse: [(value) => value],
    }
  );

  return {
    search: finalSearch,
    logs: parseSplunkResponse(response.data),
  };
}

async function fetchSplunkLogs({ earliest, index, limit }) {
  const query = `search index=${index} earliest=${earliest}`;
  return fetchSplunkBySearch(query, limit);
}

async function runCollection() {
  if (syncState.isCollecting) {
    return {
      fetched: syncState.lastFetched,
      ingested: syncState.lastIngested,
      skipped: true,
    };
  }

  if (!syncState.mongoConnected) {
    if (!syncState.collectionPausedForMongo) {
      syncState.collectionPausedForMongo = true;
      console.warn(
        "Collection paused: MongoDB is not connected. Update MONGO_URI to a reachable database and restart or reconnect the backend."
      );
    }

    return {
      fetched: 0,
      ingested: 0,
      skipped: true,
      reason: "mongo-disconnected",
    };
  }

  if (syncState.collectionPausedForMongo) {
    syncState.collectionPausedForMongo = false;
    console.log("Collection resumed: MongoDB connection restored.");
  }

  syncState.isCollecting = true;

  try {
    const index = process.env.SPLUNK_INDEX || "main";
    const earliest = syncState.lastSyncAt
      ? process.env.SPLUNK_INCREMENTAL_EARLIEST || "-5m"
      : process.env.SPLUNK_EARLIEST || "-1h";

    const localLogs = [buildLocalHeartbeatLog()];
    const { logs: splunkLogs } = await fetchSplunkLogs({
      earliest,
      index,
      limit: MAX_FETCH_LIMIT,
    });

    const allLogs = [...localLogs, ...splunkLogs];
    const ingested = await ingestLogs(allLogs);

    syncState.lastSyncAt = new Date().toISOString();
    syncState.lastFetched = allLogs.length;
    syncState.lastIngested = ingested;
    syncState.lastError = null;
    syncState.source = {
      index,
      timeWindow: earliest,
      maxEvents: MAX_FETCH_LIMIT,
    };

    return {
      fetched: allLogs.length,
      ingested,
      source: syncState.source,
    };
  } catch (error) {
    syncState.lastError = error.message;
    throw error;
  } finally {
    syncState.isCollecting = false;
  }
}

async function searchStoredLogs(parsed, limit, earliestOverride = null) {
  const filter = {
    ...parsed.mongoFilter,
    createdAt: buildTimeRangeFilter(earliestOverride || parsed.earliest),
  };

  const logs = await Log.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

  return logs.map((item) => ({
    ...item,
    level: classifyLogLevel(item.log || ""),
  }));
}

function getMailer() {
  if (mailTransporter) return mailTransporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  mailTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return mailTransporter;
}

async function sendAlertEmail(rule, matchedCount, opts = {}) {
  const owner = await User.findById(rule.userId).select("email").lean();
  const to = owner?.email || "";
  if (!to) {
    return { sent: false, reason: "Rule owner has no registered email" };
  }

  const transporter = getMailer();
  if (!transporter) {
    return { sent: false, reason: "SMTP is not configured" };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const isManualTest = Boolean(opts.manualTest);
  const subjectPrefix = isManualTest ? "[DashLogix Test]" : "[DashLogix]";

  await transporter.sendMail({
    from,
    to,
    subject: `${subjectPrefix} Alert: ${rule.name}`,
    text: [
      `Alert rule: ${rule.name}`,
      `Query: ${rule.queryText}`,
      `Threshold: ${rule.threshold}`,
      `Matched count: ${matchedCount}`,
      isManualTest ? "Run mode: manual test trigger" : "Run mode: automatic trigger",
      `Window: last ${rule.windowMinutes} minute(s)`,
      `Triggered at: ${new Date().toISOString()}`,
    ].join("\n"),
  });

  return { sent: true, to };
}

function needsRuleCheck(rule) {
  if (!rule.enabled) return false;
  if (!rule.lastCheckedAt) return true;

  const elapsedMs = Date.now() - new Date(rule.lastCheckedAt).getTime();
  return elapsedMs >= rule.checkEveryMinutes * 60 * 1000;
}

function inCooldown(rule) {
  if (!rule.lastTriggeredAt) return false;
  const elapsedMs = Date.now() - new Date(rule.lastTriggeredAt).getTime();
  return elapsedMs < rule.cooldownMinutes * 60 * 1000;
}

async function evaluateAlertRule(rule, reason = "scheduler", options = {}) {
  const parsed = parseSimpleQuery(rule.queryText);
  const windowEarliest = `-${Math.max(Number(rule.windowMinutes || 5), 1)}m`;
  const logs = await searchStoredLogs(parsed, 5000, windowEarliest);
  const errorCount = logs.filter((row) => row.level === "error").length;
  const warningCount = logs.filter((row) => row.level === "warning").length;
  const metricType = String(rule.metricType || "error");
  const matchedCount =
    metricType === "all"
      ? logs.length
      : metricType === "warning"
        ? warningCount
        : errorCount;

  const hasSplitThresholds =
    Number(rule.errorThreshold || 0) > 0 || Number(rule.warningThreshold || 0) > 0;
  const triggerReasons = [];

  if (Number(rule.errorThreshold || 0) > 0 && errorCount >= Number(rule.errorThreshold)) {
    triggerReasons.push(`errors >= ${Number(rule.errorThreshold)}`);
  }
  if (
    Number(rule.warningThreshold || 0) > 0 &&
    warningCount >= Number(rule.warningThreshold)
  ) {
    triggerReasons.push(`warnings >= ${Number(rule.warningThreshold)}`);
  }

  const thresholdHit = hasSplitThresholds
    ? triggerReasons.length > 0
    : matchedCount >= rule.threshold;
  const coolingDown = inCooldown(rule);
  const manualForceEmail = Boolean(options.forceEmail) && reason === "manual";
  const shouldTrigger = thresholdHit && !coolingDown;
  const shouldAttemptEmail = manualForceEmail || (rule.autoEmail && shouldTrigger);
  let lastEmailSent = false;
  let lastEmailReason = "";

  rule.lastCheckedAt = new Date();

  if (shouldTrigger || manualForceEmail) {
    let emailMeta = {
      sent: false,
      reason: rule.autoEmail ? "Not attempted" : "Automatic email disabled by user",
    };

    if (shouldAttemptEmail) {
      try {
        emailMeta = await sendAlertEmail(rule, matchedCount, {
          manualTest: manualForceEmail && !shouldTrigger,
        });
      } catch (error) {
        emailMeta = { sent: false, reason: error.message };
      }
    }
    lastEmailSent = Boolean(emailMeta.sent);
    lastEmailReason = String(emailMeta.reason || "");

    await AlertEvent.create({
      userId: rule.userId,
      ruleId: rule._id,
      ruleName: rule.name,
      queryText: rule.queryText,
      threshold: rule.threshold,
      matchedCount,
      errorCount,
      warningCount,
      triggerReasons: manualForceEmail && triggerReasons.length === 0 ? ["manual-test"] : triggerReasons,
      windowMinutes: rule.windowMinutes,
      emailSent: emailMeta.sent,
      emailTo: emailMeta.to || rule.emailTo || process.env.ALERT_DEFAULT_TO || "",
      error: emailMeta.sent ? "" : emailMeta.reason || "Email failed",
    });

    if (shouldTrigger) {
      rule.lastTriggeredAt = new Date();
      rule.lastTriggeredCount = matchedCount;
    }
  }

  await rule.save();

  return {
    ok: true,
    reason,
    ruleId: rule._id,
    name: rule.name,
    metricType,
    threshold: rule.threshold,
    errorThreshold: Number(rule.errorThreshold || 0),
    warningThreshold: Number(rule.warningThreshold || 0),
    errorCount,
    warningCount,
    matchedCount,
    triggerReasons,
    emailAttempted: shouldAttemptEmail,
    emailSent: lastEmailSent,
    emailReason: lastEmailReason,
    triggered: shouldTrigger,
  };
}

async function runAlertSweep() {
  if (alertSweepRunning) return;

  if (!syncState.mongoConnected) {
    if (!syncState.alertSweepPausedForMongo) {
      syncState.alertSweepPausedForMongo = true;
      console.warn(
        "Alert sweep paused: MongoDB is not connected. Rules will resume automatically after the database reconnects."
      );
    }

    return;
  }

  if (syncState.alertSweepPausedForMongo) {
    syncState.alertSweepPausedForMongo = false;
    console.log("Alert sweep resumed: MongoDB connection restored.");
  }

  alertSweepRunning = true;

  try {
    const rules = await AlertRule.find({
      enabled: true,
      userId: { $exists: true, $ne: null },
    });

    for (const rule of rules) {
      if (!needsRuleCheck(rule)) continue;
      try {
        await evaluateAlertRule(rule, "scheduler");
      } catch (error) {
        console.error(`Alert rule failed (${rule.name}):`, error.message);
      }
    }
  } finally {
    alertSweepRunning = false;
  }
}

function bucketTimestamp(date, bucketMs) {
  const t = new Date(date).getTime();
  return Math.floor(t / bucketMs) * bucketMs;
}

function createTimeBuckets(minutes, bucketMinutes) {
  const bucketMs = Math.max(bucketMinutes, 1) * 60 * 1000;
  const now = Date.now();
  const rangeStart = now - Math.max(minutes, 1) * 60 * 1000;
  const first = bucketTimestamp(rangeStart, bucketMs);

  const buckets = [];
  for (let t = first; t <= now; t += bucketMs) {
    buckets.push({
      time: new Date(t).toISOString(),
      total: 0,
      error: 0,
      warning: 0,
      info: 0,
    });
  }

  return { buckets, bucketMs, rangeStart };
}

function cleanupRealtimeSeenCache(nowTs = Date.now()) {
  const expiryMs = 15 * 60 * 1000;
  for (const [key, seenAt] of realtimeState.seen.entries()) {
    if (nowTs - seenAt > expiryMs) {
      realtimeState.seen.delete(key);
    }
  }

  const maxEntries = 6000;
  if (realtimeState.seen.size > maxEntries) {
    const overflow = realtimeState.seen.size - maxEntries;
    let removed = 0;
    for (const key of realtimeState.seen.keys()) {
      realtimeState.seen.delete(key);
      removed += 1;
      if (removed >= overflow) break;
    }
  }
}

function getRealtimeSignature(log) {
  const time = String(log.time || "");
  const host = String(log.host || "");
  const source = String(log.source || "");
  const message = String(log.log || "");
  return `${time}|${host}|${source}|${message}`;
}

function getNewRealtimeLogs(logs) {
  const nowTs = Date.now();
  cleanupRealtimeSeenCache(nowTs);
  const fresh = [];

  for (const log of logs) {
    const sig = getRealtimeSignature(log);
    if (!sig || realtimeState.seen.has(sig)) continue;
    realtimeState.seen.set(sig, nowTs);
    fresh.push(log);
  }

  return fresh;
}

function stopRealtimeStreaming() {
  if (realtimeState.intervalId) {
    clearInterval(realtimeState.intervalId);
    realtimeState.intervalId = null;
  }
  realtimeState.running = false;
}

function startRealtimeStreaming(index, limit) {
  stopRealtimeStreaming();

  realtimeState.running = true;
  realtimeState.index = index;
  realtimeState.limit = limit;
  realtimeState.lastError = null;
  realtimeState.startedAt = new Date().toISOString();
  realtimeState.lastPollAt = null;

  let inFlight = false;

  const tick = async () => {
    if (!realtimeState.running || inFlight) return;
    inFlight = true;

    try {
      const earliest = process.env.SPLUNK_REALTIME_EARLIEST || "-1m";
      const { logs } = await fetchSplunkLogs({
        earliest,
        index: realtimeState.index,
        limit: realtimeState.limit,
      });

      const newLogs = getNewRealtimeLogs(logs);
      realtimeState.lastPollAt = new Date().toISOString();

      if (newLogs.length > 0) {
        await ingestLogs(newLogs, `realtime:${realtimeState.index}`);
        for (const log of newLogs) {
          broadcast({
            type: "logEvent",
            data: log,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      realtimeState.lastError = error.message;
      broadcast({
        type: "error",
        message: `Realtime polling failed: ${error.message}`,
      });
    } finally {
      inFlight = false;
    }
  };

  realtimeState.intervalId = setInterval(tick, realtimeState.pollMs);
  tick().catch(() => {});
}

async function persistUserActivity(userId, type, page, details = {}) {
  if (!userId) return;

  await UserActivity.create({
    userId,
    type,
    page,
    details,
  });
}

routeBoth("get", "/", (_req, res) => {
  res.send("DashLogix backend is running");
});

routeBoth("get", "/health", (_req, res) => {
  res.json({
    ok: true,
    mongoConnected: syncState.mongoConnected,
    splunkBase: SPLUNK_BASE,
    wsUrl: `ws://localhost:${PORT}`,
  });
});

routeBoth("get", "/sync-status", (_req, res) => {
  res.json(syncState);
});

routeBoth(
  "post",
  "/auth/register",
  withMongoGuard(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!name || !email || password.length < 6) {
      return res.status(400).json({
        error: "Name, email, and password (min 6 chars) are required",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email is already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: "analyst",
    });

    const token = makeToken(user);

    await persistUserActivity(user._id, "auth", "register", { email });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
      },
    });
  })
);

routeBoth(
  "post",
  "/auth/login",
  withMongoGuard(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = makeToken(user);
    await persistUserActivity(user._id, "auth", "login", { email });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        lastLoginAt: user.lastLoginAt,
      },
    });
  })
);

routeBoth(
  "get",
  "/auth/me",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const user = await User.findById(req.user._id).lean();
      if (!user) return res.status(404).json({ error: "User not found" });

      res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      });
    })
  )
);

routeBoth(
  "patch",
  "/auth/profile",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const updates = {};
      if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
      if (req.body?.bio !== undefined) updates.bio = String(req.body.bio).trim();
      if (req.body?.avatarUrl !== undefined) {
        updates.avatarUrl = String(req.body.avatarUrl).trim();
      }

      const user = await User.findByIdAndUpdate(req.user._id, updates, {
        new: true,
        runValidators: true,
      }).lean();

      await persistUserActivity(req.user._id, "profile", "profile", { updated: Object.keys(updates) });

      res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      });
    })
  )
);

routeBoth(
  "get",
  "/history/search",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
      const rows = await SearchHistory.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      res.json(rows);
    })
  )
);

routeBoth(
  "get",
  "/history/activity",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
      const rows = await UserActivity.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      res.json(rows);
    })
  )
);

routeBoth(
  "post",
  "/history/activity",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const type = String(req.body?.type || "navigation").trim();
      const page = String(req.body?.page || "").trim();
      const details = req.body?.details && typeof req.body.details === "object" ? req.body.details : {};

      const row = await UserActivity.create({
        userId: req.user._id,
        type,
        page,
        details,
      });

      res.status(201).json(row);
    })
  )
);

routeBoth(
  "post",
  "/collect",
  withMongoGuard(async (_req, res) => {
    const result = await runCollection();
    res.json({ ok: true, ...result });
  })
);

routeBoth(
  "get",
  "/stored-logs",
  withMongoGuard(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 1000);
    const logs = await Log.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json(logs);
  })
);

routeBoth(
  "get",
  "/logs",
  withMongoGuard(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 1000);
    const logs = await Log.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json(logs);
  })
);

routeBoth(
  "delete",
  "/logs",
  withMongoGuard(async (_req, res) => {
    await Log.deleteMany({});
    invalidateStatsCache();
    res.json({ ok: true, message: "Logs cleared" });
  })
);

routeBoth(
  "get",
  "/stats",
  withMongoGuard(async (_req, res) => {
    const cacheKey = getStatsCacheKey("/stats");
    const cached = getCachedStats(cacheKey);
    if (cached) return res.json(cached);

    const [summary = { totalLogs: 0, errorCount: 0, warningCount: 0 }] =
      await Log.aggregate([
        {
          $group: {
            _id: null,
            totalLogs: { $sum: 1 },
            errorCount: {
              $sum: {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $ifNull: ["$log", ""] },
                      regex: "ERROR|FAILED|EXCEPTION|FATAL",
                      options: "i",
                    },
                  },
                  1,
                  0,
                ],
              },
            },
            warningCount: {
              $sum: {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $ifNull: ["$log", ""] },
                      regex: "WARN|WARNING",
                      options: "i",
                    },
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $project: { _id: 0, totalLogs: 1, errorCount: 1, warningCount: 1 } },
      ]);

    const payload = {
      totalLogs: Number(summary.totalLogs || 0),
      errorCount: Number(summary.errorCount || 0),
      warningCount: Number(summary.warningCount || 0),
      infoCount: Math.max(
        Number(summary.totalLogs || 0) -
          Number(summary.errorCount || 0) -
          Number(summary.warningCount || 0),
        0
      ),
    };
    setCachedStats(cacheKey, payload);
    res.json(payload);
  })
);

routeBoth(
  "get",
  "/dashboard/my-summary",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const userId = req.user._id;
      const [totalSearches, totalActivities, activeAlertRules, triggeredEvents] =
        await Promise.all([
          SearchHistory.countDocuments({ userId }),
          UserActivity.countDocuments({ userId }),
          AlertRule.countDocuments({ userId, enabled: true }),
          AlertEvent.countDocuments({ userId }),
        ]);

      const recentSearches = await SearchHistory.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("queryText mode resultCount createdAt")
        .lean();

      res.json({
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
        },
        totals: {
          totalSearches,
          totalActivities,
          activeAlertRules,
          triggeredEvents,
        },
        recentSearches,
      });
    })
  )
);

routeBoth(
  "get",
  "/stats/overview",
  withMongoGuard(async (_req, res) => {
    const [totalLogs, errorCount, warningCount, topHosts, topSources] = await Promise.all([
      Log.countDocuments(),
      Log.countDocuments({ log: { $regex: "ERROR|FAILED|EXCEPTION|FATAL", $options: "i" } }),
      Log.countDocuments({ log: { $regex: "WARN|WARNING", $options: "i" } }),
      Log.aggregate([
        { $group: { _id: "$host", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
      Log.aggregate([
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
      ]),
    ]);

    const infoCount = Math.max(totalLogs - errorCount - warningCount, 0);

    res.json({
      totalLogs,
      errorCount,
      warningCount,
      infoCount,
      topHosts: topHosts.map((x) => ({ label: x._id || "unknown", count: x.count })),
      topSources: topSources.map((x) => ({ label: x._id || "unknown", count: x.count })),
    });
  })
);

routeBoth(
  "get",
  "/stats/timeseries",
  withMongoGuard(async (req, res) => {
    const minutes = Math.min(Math.max(Number(req.query.minutes || 60), 5), 24 * 60);
    const bucketMinutes = Math.min(Math.max(Number(req.query.bucketMinutes || 5), 1), 60);
    const cacheKey = getStatsCacheKey("/stats/timeseries", { minutes, bucketMinutes });
    const cached = getCachedStats(cacheKey);
    if (cached) return res.json(cached);

    const { buckets, bucketMs, rangeStart } = createTimeBuckets(minutes, bucketMinutes);
    const grouped = await Log.aggregate([
      { $match: { createdAt: { $gte: new Date(rangeStart) } } },
      {
        $project: {
          bucket: {
            $dateTrunc: {
              date: "$createdAt",
              unit: "minute",
              binSize: bucketMinutes,
            },
          },
          level: {
            $switch: {
              branches: [
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$log", ""] },
                      regex: "ERROR|FAILED|EXCEPTION|FATAL",
                      options: "i",
                    },
                  },
                  then: "error",
                },
                {
                  case: {
                    $regexMatch: {
                      input: { $ifNull: ["$log", ""] },
                      regex: "WARN|WARNING",
                      options: "i",
                    },
                  },
                  then: "warning",
                },
              ],
              default: "info",
            },
          },
        },
      },
      {
        $group: {
          _id: "$bucket",
          total: { $sum: 1 },
          error: {
            $sum: { $cond: [{ $eq: ["$level", "error"] }, 1, 0] },
          },
          warning: {
            $sum: { $cond: [{ $eq: ["$level", "warning"] }, 1, 0] },
          },
          info: {
            $sum: { $cond: [{ $eq: ["$level", "info"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const indexByTimestamp = new Map(
      buckets.map((bucket, idx) => [new Date(bucket.time).getTime(), idx])
    );

    for (const point of grouped) {
      const bucketTime = bucketTimestamp(point._id, bucketMs);
      const bucketIndex = indexByTimestamp.get(bucketTime);
      if (bucketIndex === undefined) continue;

      const bucket = buckets[bucketIndex];
      bucket.total = Number(point.total || 0);
      bucket.error = Number(point.error || 0);
      bucket.warning = Number(point.warning || 0);
      bucket.info = Number(point.info || 0);
    }

    const payload = { minutes, bucketMinutes, points: buckets };
    setCachedStats(cacheKey, payload);
    res.json(payload);
  })
);

routeBoth(
  "get",
  "/stats/charts",
  withMongoGuard(async (_req, res) => {
    const cacheKey = getStatsCacheKey("/stats/charts");
    const cached = getCachedStats(cacheKey);
    if (cached) return res.json(cached);

    const [[severity = { total: 0, error: 0, warning: 0 }], sources] = await Promise.all([
      Log.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            error: {
              $sum: {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $ifNull: ["$log", ""] },
                      regex: "ERROR|FAILED|EXCEPTION|FATAL",
                      options: "i",
                    },
                  },
                  1,
                  0,
                ],
              },
            },
            warning: {
              $sum: {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $ifNull: ["$log", ""] },
                      regex: "WARN|WARNING",
                      options: "i",
                    },
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $project: { _id: 0, total: 1, error: 1, warning: 1 } },
      ]),
      Log.aggregate([
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
    ]);
    const payload = {
      severity: [
        { label: "Error", count: Number(severity.error || 0), color: "#ff6b6b" },
        { label: "Warning", count: Number(severity.warning || 0), color: "#ffa500" },
        {
          label: "Info",
          count: Math.max(
            Number(severity.total || 0) -
              Number(severity.error || 0) -
              Number(severity.warning || 0),
            0
          ),
          color: "#4dabf7",
        },
      ],
      sources: sources.map((x) => ({ label: x._id || "unknown", count: x.count })),
    };
    setCachedStats(cacheKey, payload);
    res.json(payload);
  })
);

routeBoth("get", "/query-to-spl", (req, res) => {
  const q = String(req.query.q || "").trim();
  const parsed = parseSimpleQuery(q);

  res.json({
    ok: true,
    input: q,
    splQuery: parsed.splQuery,
    earliest: parsed.earliest,
    index: parsed.index,
    interpreted: {
      level: parsed.levelHint,
      text: parsed.textTerms,
    },
  });
});

routeBoth(
  "get",
  "/search",
  withMongoGuard(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const parsed = parseSimpleQuery(q);
    const options = resolveSearchOptions(req.query);
    const user = await getUserFromReq(req);

    let payload;

    if (options.live) {
      const { logs, search } = await fetchSplunkBySearch(parsed.splQuery, options.limit);
      const ingested = await ingestLogs(logs, `search:${q || "default"}`);

      payload = {
        ok: true,
        mode: "splunk-live",
        input: q,
        splQuery: search,
        count: logs.length,
        ingested,
        logs,
      };
    } else {
      const logs = await searchStoredLogs(parsed, options.limit);
      payload = {
        ok: true,
        mode: "mongo-cache",
        input: q,
        splQuery: parsed.splQuery,
        count: logs.length,
        logs,
      };
    }

    if (user?._id) {
      await SearchHistory.create({
        userId: user._id,
        queryText: q || "(empty)",
        splQuery: payload.splQuery,
        mode: payload.mode,
        resultCount: payload.count,
        filters: {
          live: options.live,
          limit: options.limit,
          earliest: parsed.earliest,
          level: parsed.levelHint,
        },
      });

      await persistUserActivity(user._id, "search", "search", {
        queryText: q,
        mode: payload.mode,
        resultCount: payload.count,
      });
    }

    res.json(payload);
  })
);

routeBoth(
  "get",
  "/alerts/rules",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const rules = await AlertRule.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .lean();
      res.json(rules);
    })
  )
);

routeBoth(
  "post",
  "/alerts/rules",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const payload = req.body || {};

      const doc = await AlertRule.create({
        userId: req.user._id,
        name: String(payload.name || "Untitled alert").trim(),
        queryText: String(payload.queryText || "error last 5m").trim(),
        metricType: ["error", "warning", "all"].includes(String(payload.metricType))
          ? String(payload.metricType)
          : "error",
        threshold: Math.max(Number(payload.threshold || 10), 1),
        errorThreshold: Math.max(Number(payload.errorThreshold || 0), 0),
        warningThreshold: Math.max(Number(payload.warningThreshold || 0), 0),
        windowMinutes: Math.max(Number(payload.windowMinutes || 5), 1),
        checkEveryMinutes: Math.max(Number(payload.checkEveryMinutes || 1), 1),
      cooldownMinutes: Math.max(Number(payload.cooldownMinutes || 10), 1),
      emailTo: String(req.user.email || "").trim(),
      autoEmail: Boolean(payload.autoEmail),
      enabled: payload.enabled !== false,
    });

      res.status(201).json(doc);
    })
  )
);

routeBoth(
  "patch",
  "/alerts/rules/:id",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const updates = {};
      const body = req.body || {};

      if (body.name !== undefined) updates.name = String(body.name).trim();
      if (body.queryText !== undefined) updates.queryText = String(body.queryText).trim();
      if (body.metricType !== undefined) {
        const metricType = String(body.metricType);
        if (["error", "warning", "all"].includes(metricType)) {
          updates.metricType = metricType;
        }
      }
      if (body.threshold !== undefined) updates.threshold = Math.max(Number(body.threshold), 1);
      if (body.errorThreshold !== undefined) {
        updates.errorThreshold = Math.max(Number(body.errorThreshold), 0);
      }
      if (body.warningThreshold !== undefined) {
        updates.warningThreshold = Math.max(Number(body.warningThreshold), 0);
      }
      if (body.windowMinutes !== undefined) {
        updates.windowMinutes = Math.max(Number(body.windowMinutes), 1);
      }
      if (body.checkEveryMinutes !== undefined) {
        updates.checkEveryMinutes = Math.max(Number(body.checkEveryMinutes), 1);
      }
      if (body.cooldownMinutes !== undefined) {
        updates.cooldownMinutes = Math.max(Number(body.cooldownMinutes), 1);
      }
      if (body.autoEmail !== undefined) updates.autoEmail = Boolean(body.autoEmail);
      if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);

      const updated = await AlertRule.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        updates,
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({ error: "Alert rule not found" });
      }

      res.json(updated);
    })
  )
);

routeBoth(
  "delete",
  "/alerts/rules/:id",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const deleted = await AlertRule.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id,
      });
      if (!deleted) {
        return res.status(404).json({ error: "Alert rule not found" });
      }

      res.json({ ok: true });
    })
  )
);

routeBoth(
  "post",
  "/alerts/run-now/:id",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const rule = await AlertRule.findOne({ _id: req.params.id, userId: req.user._id });
      if (!rule) {
        return res.status(404).json({ error: "Alert rule not found" });
      }

      const result = await evaluateAlertRule(rule, "manual", { forceEmail: true });
      res.json(result);
    })
  )
);

routeBoth(
  "get",
  "/alerts/events",
  withMongoGuard(
    requireAuth(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const events = await AlertEvent.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      res.json(events);
    })
  )
);

const server = http.createServer(app);
const wsClients = new Set();
const wss = new WebSocketServer({ server });

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
}

wss.on("connection", (socket) => {
  wsClients.add(socket);

  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") {
        socket.send(
          JSON.stringify({ type: "pong", timestamp: new Date().toISOString() })
        );
      }
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  });

  socket.on("close", () => wsClients.delete(socket));
  socket.on("error", () => wsClients.delete(socket));
});

routeBoth(
  "post",
  "/realtime-start",
  withMongoGuard(async (req, res) => {
    const index = (req.body?.index || process.env.SPLUNK_INDEX || "_internal").trim();
    const limit = Math.min(Math.max(Number(req.body?.limit || 100), 1), 1000);

    startRealtimeStreaming(index, limit);

    broadcast({
      type: "realtimeStarted",
      message: "Real-time monitoring started",
      index,
    });

    res.json({
      ok: true,
      message: "Real-time monitoring started",
      fetched: 0,
      index,
      wsUrl: `ws://localhost:${PORT}`,
      pollMs: realtimeState.pollMs,
    });
  })
);

routeBoth(
  "post",
  "/realtime-stop",
  withMongoGuard(async (_req, res) => {
    stopRealtimeStreaming();
    broadcast({
      type: "realtimeStopped",
      message: "Real-time monitoring stopped",
    });
    res.json({ ok: true, running: false });
  })
);

routeBoth("get", "/realtime-status", (_req, res) => {
  res.json({
    ok: true,
    running: realtimeState.running,
    index: realtimeState.index,
    limit: realtimeState.limit,
    pollMs: realtimeState.pollMs,
    startedAt: realtimeState.startedAt,
    lastPollAt: realtimeState.lastPollAt,
    lastError: realtimeState.lastError,
    wsConnected: wsClients.size,
    wsUrl: `ws://localhost:${PORT}`,
    features: ["Real-time log streaming", "WebSocket support", "Internal index monitoring"],
  });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    syncState.mongoConnected = true;
    console.log("MongoDB connected");
  })
  .catch((error) => {
    syncState.mongoConnected = false;
    syncState.lastError = error.message;
    console.error("MongoDB connection failed:", error.message);
  });

mongoose.connection.on("connected", () => {
  syncState.mongoConnected = true;
});

mongoose.connection.on("disconnected", () => {
  syncState.mongoConnected = false;
});

if (COLLECT_INTERVAL_MS > 0) {
  setInterval(() => {
    runCollection().catch((error) => {
      syncState.lastError = error.message;
      console.error("Collection failed:", error.message);
    });
  }, COLLECT_INTERVAL_MS);
}

if (ALERT_TICK_MS > 0) {
  setInterval(() => {
    runAlertSweep().catch((error) => {
      console.error("Alert sweep failed:", error.message);
    });
  }, ALERT_TICK_MS);
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (API: ${API_PREFIX}/sync-status or /sync-status)`);
  console.log(`WebSocket available at ws://localhost:${PORT}`);
});
