// 🔥 GLOBAL ERROR HANDLER
process.on("unhandledRejection", (err) => {
  console.log("🔥 UNHANDLED ERROR:", err);
});

import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import axios from "axios";
import https from "https";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { WebSocketServer } from "ws";
import http from "http";
import Log from "./models/Log.js";

dotenv.config();

// Default 5001 — port 5000 is often taken on Windows (e.g. AirPlay), causing fake 404s
const PORT = Number(process.env.PORT) || 5001;
const rawScheme = (
  process.env.SPLUNK_SCHEME ||
  process.env.SPLUNK_PROTOCOL ||
  "https"
)
  .toLowerCase()
  .replace(/:$/, "");
const splunkScheme = rawScheme === "http" || rawScheme === "https" ? rawScheme : "https";
const splunkBase = `${splunkScheme}://${process.env.SPLUNK_HOST}:${process.env.SPLUNK_PORT}`;

const splunkTlsOpts =
  splunkScheme === "https"
    ? { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
    : {};

const COLLECT_INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.COLLECT_INTERVAL_MS) || 5_000
);

const AUTO_QUERY_LABEL = (customEarliest = null) => {
  const index = process.env.SPLUNK_INDEX || "main";
  // Use custom earliest (for real-time), or fallback to env/default
  const earliest = customEarliest || process.env.SPLUNK_EARLIEST || "-15m";
  const limit = Math.min(
    Math.max(1, Number(process.env.SPLUNK_COLLECT_LIMIT) || 200),
    1000
  );
  return { index, earliest, limit, label: `auto:index=${index}:earliest=${earliest}:limit=${limit}` };
};

const buildSplunkSearch = (customEarliest = null) => {
  const index = process.env.SPLUNK_INDEX || "_internal";
  const limit = Math.min(
    Math.max(1, Number(process.env.SPLUNK_COLLECT_LIMIT) || 200),
    1000
  );
  // Try universal search - this should work for any index
  return `search * index=${index} | head ${limit}`;
};

const app = express();
app.use(cors());
app.use(express.json());

console.log("🔍 Splunk API base:", splunkBase);

// --- Splunk + ingest (SPL only on server; users never see it) ---
const generateLogHash = (log) => {
  const data = `${log.time}-${log.host}-${log.log}`;
  return crypto.createHash("md5").update(data).digest("hex");
};

async function splunkLogin() {
  const loginRes = await axios.post(
    `${splunkBase}/services/auth/login`,
    new URLSearchParams({
      username: process.env.SPLUNK_USERNAME,
      password: process.env.SPLUNK_PASSWORD,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      ...splunkTlsOpts,
    }
  );
  const match = loginRes.data.match(/<sessionKey>(.*?)<\/sessionKey>/);
  if (!match) throw new Error("Splunk login: no session key");
  return match[1];
}

async function runSplunkExport(searchString) {
  try {
    const sessionKey = await splunkLogin();
    console.log(`🔍 Running Splunk search: ${searchString}`);
    
    const searchRes = await axios.post(
      `${splunkBase}/services/search/jobs/export`,
      new URLSearchParams({
        search: searchString,
        output_mode: "json",
      }),
      {
        headers: {
          Authorization: `Splunk ${sessionKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        ...splunkTlsOpts,
      }
    );

    const raw = searchRes.data;
    console.log(`📦 Raw response type: ${typeof raw}`);
    
    let results = [];
    
    // Handle different response types
    if (typeof raw === "object" && raw.results) {
      // Standard Splunk JSON response with results array
      console.log(`📝 Processing ${raw.results.length} results from Splunk`);
      results = raw.results.map((result) => {
        const log = result?._raw || JSON.stringify(result);
        return {
          time: result?._time || null,
          host: result?.host || null,
          source: result?.source || null,
          log: log,
        };
      });
    } else if (typeof raw === "string") {
      // NDJSON response (newline-delimited JSON)
      const lines = raw
        .trim()
        .split("\n")
        .filter(Boolean);
      
      console.log(`📝 Processing ${lines.length} lines from response`);
      
      results = lines
        .map((line) => {
          try {
            const parsed = JSON.parse(line);
            // Skip metadata messages - they have "preview" or "messages" keys
            if (parsed.preview !== undefined || parsed.messages) {
              console.log(`⏭️ Skipping metadata: ${line.substring(0, 80)}`);
              return null;
            }
            // This is an actual event
            const result = parsed?.result || parsed;
            const logText = result?._raw || JSON.stringify(result);
            if (!logText) return null;
            
            return {
              time: result?._time || null,
              host: result?.host || null,
              source: result?.source || null,
              log: logText,
            };
          } catch (e) {
            console.log(`⚠️ Parse error: ${e.message}`);
            return null;
          }
        })
        .filter((v) => v !== null);
    }
    
    console.log(`✅ Extracted ${results.length} valid logs from Splunk`);
    return results;
  } catch (err) {
    console.log(`❌ Splunk export error: ${err.message}`);
    throw err;
  }
}

async function ingestLogs(logs, queryLabel) {
  if (logs.length === 0) return { fetched: 0, ingested: 0 };

  const existingHashes = await Log.find().then((docs) =>
    new Set(docs.map((doc) => generateLogHash(doc)))
  );

  const newLogs = logs.filter((log) => {
    const hash = generateLogHash(log);
    return !existingHashes.has(hash);
  });

  if (newLogs.length > 0) {
    await Log.insertMany(
      newLogs.map((l) => ({
        ...l,
        query: queryLabel,
      }))
    );
  }

  return { fetched: logs.length, ingested: newLogs.length };
}

// --- REAL-TIME MONITORING ---
const realtimeSearches = new Map(); // Track active real-time searches

async function runRealtimeSplunkSearch(sessionKey, searchString, onData, onComplete, onError) {
  try {
    console.log(`🔴 Starting real-time search: ${searchString}`);
    
    let buffer = '';
    let eventCount = 0;

    const searchRes = await axios.post(
      `${splunkBase}/services/search/jobs`,
      new URLSearchParams({
        search: searchString,
        output_mode: "json",
        earliest_time: "rt-30s", // Real-time: last 30 seconds
        search_mode: "realtime",
      }),
      {
        headers: {
          Authorization: `Splunk ${sessionKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        ...splunkTlsOpts,
      }
    );

    const jobSid = searchRes.data?.sid;
    if (!jobSid) {
      throw new Error("Failed to create real-time search job - no SID returned");
    }

    console.log(`🎥 Real-time search job created: ${jobSid}`);

    // Poll for results
    const pollInterval = setInterval(async () => {
      try {
        const resultsRes = await axios.get(
          `${splunkBase}/services/search/jobs/${jobSid}/results`,
          {
            params: {
              output_mode: "json",
              count: 100,
            },
            headers: {
              Authorization: `Splunk ${sessionKey}`,
            },
            ...splunkTlsOpts,
          }
        );

        const results = resultsRes.data?.results || [];
        
        if (results.length > 0) {
          results.forEach((result) => {
            const log = result?._raw || JSON.stringify(result);
            const logObj = {
              time: result?._time || new Date().toISOString(),
              host: result?.host || "splunk",
              source: result?.source || "_internal",
              log: log,
            };
            onData(logObj);
            eventCount++;
          });
          console.log(`📊 Real-time: ${eventCount} events received`);
        }
      } catch (err) {
        console.log(`⚠️ Real-time poll error: ${err.message}`);
        onError(err);
      }
    }, 1000); // Poll every 1 second

    // Return job tracking info
    return { jobSid, pollInterval };
  } catch (err) {
    console.log(`❌ Real-time search error: ${err.message}`);
    onError(err);
    throw err;
  }
}

let collectInProgress = false;
let lastSyncAt = null;
let lastFetched = 0;
let lastIngested = 0;
let lastError = null;
let consecutiveEmptyFetches = 0;

// Build earliest time for next collection (fetch only new logs since last sync)
function getEarliestForNextCollection() {
  // Always use relative time windows for reliability
  // If we got 0 results multiple times, expand the window
  if (consecutiveEmptyFetches > 2) {
    console.log(`⚠️ Too many empty fetches (${consecutiveEmptyFetches}), using -24h window`);
    consecutiveEmptyFetches = 0;
    return "-24h";
  }
  
  if (!lastSyncAt) {
    // First collection: use -24h window to catch ALL existing logs
    console.log(`🆕 First collection, using -24h window to fetch all logs`);
    return "-24h";
  }
  
  // After first collection, use smaller increments
  // This ensures we get new logs quickly without missing any
  console.log(`🔄 Incremental collection, using -10m window (last sync: ${lastSyncAt.toISOString()})`);
  return "-10m";
}

// --- LOCAL LOG COLLECTION (Windows Event Viewer & Application Logs) ---

async function collectWindowsEventLogs() {
  try {
    // Execute PowerShell to get latest event logs
    const logs = await new Promise((resolve, reject) => {
      const ps = spawn("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Get-EventLog -LogName Application -Newest 50 2>/dev/null | ForEach-Object { @{ TimeGenerated = $_.TimeGenerated.ToString('o'); Source = $_.Source; EventID = $_.EventID; Message = $_.Message } } | ConvertTo-Json`
      ]);

      let output = "";
      let errorOutput = "";

      ps.stdout.on("data", (data) => {
        output += data.toString();
      });

      ps.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      ps.on("close", (code) => {
        if (code === 0 && output.trim()) {
          try {
            const parsed = JSON.parse(output);
            const logArray = Array.isArray(parsed) ? parsed : [parsed];
            resolve(logArray.map((log) => ({
              time: log.TimeGenerated,
              host: "LOCAL_MACHINE",
              source: log.Source,
              log: `[${log.EventID}] ${log.Message}`,
            })));
          } catch (e) {
            resolve([]);
          }
        } else {
          resolve([]);
        }
      });
    });

    return logs;
  } catch (err) {
    console.log(`⚠️ Windows event collection failed: ${err.message}`);
    return [];
  }
}

async function collectSystemLogs() {
  try {
    // Look for common log directories
    const commonLogPaths = [
      path.join(process.env.APPDATA || "C:\\Users\\AppData\\Roaming", "logs"),
      path.join(process.env.ProgramFiles || "C:\\Program Files", "logs"),
      "C:\\logs",
      "C:\\temp\\logs",
    ];

    let logs = [];

    for (const logPath of commonLogPaths) {
      if (fs.existsSync(logPath)) {
        const files = fs.readdirSync(logPath).filter(f => f.endsWith(".log"));
        
        for (const file of files.slice(0, 5)) { // Limit to 5 files
          try {
            const filePath = path.join(logPath, file);
            const stat = fs.statSync(filePath);
            
            // Only read recent files (modified in last hour)
            if (Date.now() - stat.mtimeMs < 3600000) {
              const content = fs.readFileSync(filePath, "utf-8");
              const lines = content.split("\n").slice(-10); // Last 10 lines
              
              logs.push(...lines
                .filter(l => l.trim())
                .map(line => ({
                  time: new Date().toISOString(),
                  host: "LOCAL_MACHINE",
                  source: file,
                  log: line.trim(),
                }))
              );
            }
          } catch (e) {
            console.log(`⚠️ Error reading log file: ${e.message}`);
          }
        }
      }
    }

    return logs;
  } catch (err) {
    console.log(`⚠️ System log collection failed: ${err.message}`);
    return [];
  }
}

async function collectLocalLogs() {
  try {
    // Disabled: Only collect from Splunk now
    console.log(`📱 Local collection disabled - using Splunk only`);
    return [];
  } catch (err) {
    console.log(`⚠️ Local log collection failed: ${err.message}`);
    return [];
  }
}

async function collectLogs() {
  if (collectInProgress) {
    console.log(`⏳ Collection already in progress, skipping`);
    return { skipped: true, reason: "already_running" };
  }
  collectInProgress = true;
  lastError = null;

  try {
    let totalLogs = 0;
    let totalIngested = 0;

    // Collect from LOCAL SYSTEM first
    const localLogs = await collectLocalLogs();
    if (localLogs.length > 0) {
      const { fetched: localFetched, ingested: localIngested } = await ingestLogs(localLogs, "local:system");
      console.log(`📱 Local logs: fetched ${localFetched}, ingested ${localIngested}`);
      totalLogs += localFetched;
      totalIngested += localIngested;
    }

    // Then collect from SPLUNK
    try {
      const customEarliest = getEarliestForNextCollection();
      const searchString = buildSplunkSearch(customEarliest);
      const { label } = AUTO_QUERY_LABEL(customEarliest);
      
      console.log(`🔎 Collecting from Splunk with window: ${customEarliest || 'default'}`);
      
      const logs = await runSplunkExport(searchString);
      const { fetched, ingested } = await ingestLogs(logs, label);
      
      console.log(`🔎 Splunk logs: fetched ${fetched}, ingested ${ingested}`);
      totalLogs += fetched;
      totalIngested += ingested;
    } catch (splunkErr) {
      console.log(`⚠️ Splunk collection failed (continuing with local logs): ${splunkErr.message}`);
    }

    lastFetched = totalLogs;
    lastIngested = totalIngested;
    lastSyncAt = new Date();
    
    if (totalLogs === 0) {
      consecutiveEmptyFetches++;
      console.log(`⚠️ Empty collection #${consecutiveEmptyFetches}: fetched ${totalLogs}`);
    } else {
      consecutiveEmptyFetches = 0;
      console.log(`✅ Collection complete: fetched ${totalLogs}, ingested ${totalIngested}`);
    }
    
    return { skipped: false, fetched: totalLogs, ingested: totalIngested, lastSyncAt };
  } catch (err) {
    lastError = err.message || String(err);
    console.log(`❌ Collection error: ${lastError}`);
    consecutiveEmptyFetches = 0;
    throw err;
  } finally {
    collectInProgress = false;
  }
}

function startAutomaticCollection() {
  collectLogs().catch(() => {});
  setInterval(() => {
    collectLogs().catch(() => {});
  }, COLLECT_INTERVAL_MS);
  console.log(
    `📥 Automatic log collection every ${COLLECT_INTERVAL_MS / 1000}s (SPL is server-side only)`
  );
}

function mongoConnected() {
  return mongoose.connection.readyState === 1;
}

// MongoDB
if (!process.env.MONGO_URI) {
  console.log("❌ MONGO_URI is missing — set it in dashlogix-backend/.env");
} else {
  mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 20_000,
      // Prefer IPv4 — avoids some Windows / DNS setups where IPv6 to Atlas fails
      family: 4,
    })
    .then(() => {
      console.log("MongoDB connected 😎");
      startAutomaticCollection();
    })
    .catch((err) => {
      console.log("❌ MongoDB connection failed:", err.message);
      console.log(
        "   → Atlas: Network Access → add your IP or 0.0.0.0/0 (dev). Check user/password in MONGO_URI."
      );
    });
}

app.get("/", (req, res) => {
  res.send("DashLogix backend running 🚀");
});

const api = express.Router();

api.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "dashlogix-backend",
    mongo: {
      connected: mongoConnected(),
      state: mongoose.connection.readyState,
    },
  });
});

api.get("/sync-status", (req, res) => {
  const { index, earliest, limit } = AUTO_QUERY_LABEL();
  res.json({
    lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
    lastFetched,
    lastIngested,
    lastError,
    collectInProgress,
    intervalMs: COLLECT_INTERVAL_MS,
    mongoConnected: mongoConnected(),
    source: {
      index,
      timeWindow: earliest,
      maxEvents: limit,
    },
  });
});

api.use((req, res, next) => {
  if (mongoConnected()) return next();
  res.status(503).json({
    error: "MongoDB is not connected",
    hint:
      "Set MONGO_URI in dashlogix-backend/.env. For MongoDB Atlas: open Network Access and allow your current IP (or 0.0.0.0/0 for development). Verify the database user password.",
    mongoState: mongoose.connection.readyState,
  });
});

api.post("/collect", async (req, res) => {
  try {
    const result = await collectLogs();
    if (result.skipped) {
      return res.status(202).json({
        ok: true,
        message: "Collection already in progress",
        ...result,
      });
    }
    res.json({
      ok: true,
      fetched: result.fetched,
      ingested: result.ingested,
      lastSyncAt: result.lastSyncAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Splunk collection failed",
      details: error.message,
    });
  }
});

api.get("/stored-logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const logs = await Log.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    console.log(`✅ Retrieved ${logs.length} stored logs`);
    res.json(logs);
  } catch (err) {
    console.log("❌ Error retrieving stored logs:", err.message);
    res.status(500).json({ error: err.message });
  }
});

api.get("/stats", async (req, res) => {
  try {
    const totalLogs = await Log.countDocuments();
    const errorCount = await Log.countDocuments({
      log: { $regex: "ERROR", $options: "i" },
    });
    const warningCount = await Log.countDocuments({
      log: { $regex: "WARNING|WARN", $options: "i" },
    });

    console.log("✅ Stats calculated");
    res.json({
      totalLogs,
      errorCount,
      warningCount,
      infoCount: totalLogs - errorCount - warningCount,
      lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
      lastError,
    });
  } catch (err) {
    console.log("❌ Error calculating stats:", err.message);
    res.status(500).json({ error: err.message });
  }
});

api.delete("/logs", async (req, res) => {
  try {
    const result = await Log.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} logs`);
    res.json({
      message: `Cleared ${result.deletedCount} logs`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.log("❌ Error clearing logs:", err.message);
    res.status(500).json({ error: err.message });
  }
});

api.post("/realtime-start", async (req, res) => {
  try {
    const { index = "_internal", limit = 100 } = req.body;
    
    console.log(`🔴 Starting real-time monitoring for index: ${index}`);
    
    const sessionKey = await splunkLogin();
    const searchString = `search * index=${index} | head ${Math.min(limit, 1000)}`;
    
    let newLogsCount = 0;
    
    const onData = async (logObj) => {
      try {
        // Ingest the new log into MongoDB
        const hash = generateLogHash(logObj);
        const existing = await Log.findOne({ log: logObj.log });
        
        if (!existing) {
          await Log.create({
            ...logObj,
            query: `realtime:index=${index}`,
          });
          newLogsCount++;
        }
      } catch (err) {
        console.log(`⚠️ Error ingesting log: ${err.message}`);
      }
    };
    
    const onComplete = () => {
      console.log(`✅ Real-time ingestion completed: ${newLogsCount} new logs`);
    };
    
    const onError = (err) => {
      console.log(`❌ Real-time ingestion error: ${err.message}`);
    };
    
    const jobTracking = await runRealtimeSplunkSearch(sessionKey, searchString, onData, onComplete, onError);
    
    res.json({
      ok: true,
      message: "Real-time monitoring started",
      jobSid: jobTracking.jobSid,
      index,
      wsUrl: `ws://localhost:${PORT}`,
    });
  } catch (err) {
    console.log(`❌ Real-time start error: ${err.message}`);
    res.status(500).json({
      ok: false,
      error: "Failed to start real-time monitoring",
      details: err.message,
    });
  }
});

api.get("/realtime-status", (req, res) => {
  res.json({
    ok: true,
    wsConnected: currentWsClients.length,
    wsUrl: `ws://localhost:${PORT}`,
    features: [
      "Real-time log streaming",
      "WebSocket support",
      "Internal index monitoring",
    ],
  });
});

// Same routes at /api/* and /* (proxies / older clients often use /api)
app.use("/api", api);
app.use(api);

// --- WEBSOCKET SERVER FOR REAL-TIME MONITORING ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected WebSocket clients
let currentWsClients = [];

wss.on("connection", (ws) => {
  console.log(`🔗 WebSocket client connected (total: ${wss.clients.size})`);
  currentWsClients.push(ws);

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === "startRealtime") {
        console.log(`📡 Client requesting real-time monitoring`);
        
        // Start real-time search
        const sessionKey = await splunkLogin();
        const searchString = `search * index=${data.index || "_internal"} | head ${data.limit || 100}`;
        
        let jobTracking = null;
        
        const onData = (logObj) => {
          // Send to all connected clients
          currentWsClients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: "logEvent",
                data: logObj,
                timestamp: new Date().toISOString(),
              }));
            }
          });
        };

        const onComplete = () => {
          console.log(`✅ Real-time search completed`);
          currentWsClients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: "searchComplete",
                message: "Real-time monitoring ended",
              }));
            }
          });
        };

        const onError = (err) => {
          console.log(`❌ Real-time search error: ${err.message}`);
          currentWsClients.forEach((client) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: "error",
                message: err.message,
              }));
            }
          });
        };

        try {
          jobTracking = await runRealtimeSplunkSearch(sessionKey, searchString, onData, onComplete, onError);
          
          ws.send(JSON.stringify({
            type: "realtimeStarted",
            jobSid: jobTracking.jobSid,
            message: "Real-time monitoring started",
          }));
        } catch (err) {
          ws.send(JSON.stringify({
            type: "error",
            message: `Failed to start real-time search: ${err.message}`,
          }));
        }
      } else if (data.type === "ping") {
        ws.send(JSON.stringify({
          type: "pong",
          timestamp: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.log(`WebSocket message error: ${err.message}`);
      ws.send(JSON.stringify({
        type: "error",
        message: err.message,
      }));
    }
  });

  ws.on("close", () => {
    currentWsClients = currentWsClients.filter((client) => client !== ws);
    console.log(`🔌 WebSocket client disconnected (remaining: ${currentWsClients.length})`);
  });

  ws.on("error", (err) => {
    console.log(`❌ WebSocket error: ${err.message}`);
  });
});

server.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT} 🚀 (API: /api/sync-status or /sync-status)`
  );
  console.log(`📡 WebSocket available at ws://localhost:${PORT}`);
});
