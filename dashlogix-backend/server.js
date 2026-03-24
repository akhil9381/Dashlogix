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
import Log from "./models/Log.js";
import SearchHistory from "./models/SearchHistory.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ DEBUG
console.log("🔍 SPLUNK PORT:", process.env.SPLUNK_PORT);

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected 😎"))
  .catch(err => console.log("Mongo Error:", err));


// 🔥 TEST ROUTE
app.get("/", (req, res) => {
  res.send("DashLogix backend running 🚀");
});


// 🔥 UTILITY: Generate hash for log deduplication
const generateLogHash = (log) => {
  const data = `${log.time}-${log.host}-${log.log}`;
  return crypto.createHash("md5").update(data).digest("hex");
};

// 🔥 SPLUNK LOGS ROUTE (ENHANCED WITH DEDUPLICATION)
app.get("/logs", async (req, res) => {
  console.log("➡️ /logs route hit");

  try {
    // ✅ GET QUERY FROM URL
    let userQuery = req.query.q || "index=main | head 10";

    // 🔥 SAFETY: handle if "search" already included
    if (!userQuery.trim().toLowerCase().startsWith("search")) {
      userQuery = `search ${userQuery}`;
    }

    // 🔐 STEP 1: LOGIN
    const loginRes = await axios.post(
      `https://${process.env.SPLUNK_HOST}:${process.env.SPLUNK_PORT}/services/auth/login`,
      new URLSearchParams({
        username: process.env.SPLUNK_USERNAME,
        password: process.env.SPLUNK_PASSWORD,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }
    );

    const sessionKey =
      loginRes.data.match(/<sessionKey>(.*?)<\/sessionKey>/)[1];

    console.log("✅ Logged into Splunk");

    // 🔍 STEP 2: RUN QUERY
    const searchRes = await axios.post(
      `https://${process.env.SPLUNK_HOST}:${process.env.SPLUNK_PORT}/services/search/jobs/export`,
      new URLSearchParams({
        search: userQuery,
        output_mode: "json",
      }),
      {
        headers: {
          Authorization: `Splunk ${sessionKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }
    );

    console.log("✅ Results fetched from Splunk");

    // 🔥 CLEAN RESPONSE
    const logs = searchRes.data
      .trim()
      .split("\n")
      .map(line => {
        try {
          const parsed = JSON.parse(line);
          return {
            time: parsed.result._time,
            host: parsed.result.host,
            source: parsed.result.source,
            log: parsed.result._raw,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // 🔥 DEDUPLICATION: Avoid storing duplicate logs
    if (logs.length > 0) {
      const existingHashes = await Log.find().then(docs =>
        new Set(docs.map(doc => generateLogHash(doc)))
      );

      const newLogs = logs.filter(log => {
        const hash = generateLogHash(log);
        return !existingHashes.has(hash);
      });

      if (newLogs.length > 0) {
        await Log.insertMany(
          newLogs.map(l => ({
            ...l,
            query: userQuery,
          }))
        );
        console.log(`✅ Stored ${newLogs.length} new logs to MongoDB (${logs.length - newLogs.length} duplicates skipped)`);
      } else {
        console.log(`⚠️  All ${logs.length} logs were duplicates, skipped storage`);
      }
    }

    // 🔥 SAVE SEARCH QUERY TO HISTORY
    await SearchHistory.create({ query: req.query.q });
    console.log("✅ Search query saved to history");

    res.json(logs);

  } catch (error) {
    console.log("❌ ERROR:", error.message);

    res.status(500).json({
      error: "Splunk REST failed",
      details: error.message,
    });
  }
});


// � GET STORED LOGS FROM DATABASE
app.get("/stored-logs", async (req, res) => {
  try {
    const logs = await Log.find()
      .sort({ createdAt: -1 })
      .limit(50);

    console.log(`✅ Retrieved ${logs.length} stored logs`);
    res.json(logs);
  } catch (err) {
    console.log("❌ Error retrieving stored logs:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔥 GET SEARCH HISTORY
app.get("/history", async (req, res) => {
  try {
    const history = await SearchHistory.find()
      .sort({ timestamp: -1 })
      .limit(10);

    console.log(`✅ Retrieved ${history.length} search history items`);
    res.json(history);
  } catch (err) {
    console.log("❌ Error retrieving search history:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔥 GET STATS (total logs, errors, warnings)
app.get("/stats", async (req, res) => {
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
    });
  } catch (err) {
    console.log("❌ Error calculating stats:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔥 CLEAR ALL STORED LOGS (for testing)
app.delete("/logs", async (req, res) => {
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

// �🚀 START SERVER
app.listen(5000, () => {
  console.log("Server running on port 5000 🚀");
});