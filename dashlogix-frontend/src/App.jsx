import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import LogFeedIntro from "./components/LogFeedIntro";
import FilterButtons from "./components/FilterButtons";
import StatsCards from "./components/StatsCards";
import LogsTable from "./components/LogsTable";
import SyncStatus from "./components/SyncStatus";
import RealtimeMonitor from "./components/RealtimeMonitor";
import { API_BASE } from "./apiConfig";
import "./App.css";

function formatDashboardError(err) {
  if (!err.response) {
    return [
      "Could not reach the DashLogix API.",
      "From the project root run npm run dev, open http://localhost:3000 (Vite proxies /api to the backend on port 5001).",
      "If you use a production build, set VITE_API_URL to your API origin when running vite build.",
    ].join(" ");
  }
  const { status, data } = err.response;
  if (status === 503 && data?.hint) {
    return `${data.error || "Database unavailable"}. ${data.hint}`;
  }
  if (typeof data?.error === "string") return data.error;
  if (data?.details) return String(data.details);
  return `Request failed (${status}).`;
}

export default function App() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState(null);
  const [realtimeOpen, setRealtimeOpen] = useState(false);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/stored-logs`),
        axios.get(`${API_BASE}/stats`),
      ]);
      setLogs(logsRes.data || []);
      setStats(statsRes.data || null);
    } catch (err) {
      console.error("Error loading dashboard:", err);
      setError(formatDashboardError(err));
    } finally {
      setLoading(false);
    }
  }, [API_BASE]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    // Refresh every 2 seconds for real-time updates
    const id = setInterval(() => {
      axios
        .get(`${API_BASE}/stored-logs`)
        .then((r) => setLogs(r.data || []))
        .catch(() => {});
      axios
        .get(`${API_BASE}/stats`)
        .then((r) => setStats(r.data || null))
        .catch(() => {});
    }, 2_000);
    return () => clearInterval(id);
  }, [API_BASE]);

  const handleClearLogs = async () => {
    if (window.confirm("Are you sure you want to clear all stored logs?")) {
      try {
        await axios.delete(`${API_BASE}/logs`);
        setLogs([]);
        await refreshData();
        console.log("✅ Logs cleared");
      } catch (err) {
        console.error("Error clearing logs:", err);
        setError("Failed to clear logs");
      }
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>DashLogix</h1>
        <p>
          Log monitoring without writing queries — Splunk collects and
          processes events in the background; you just explore what was saved.
        </p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-container">
        <aside className="sidebar">
          <SyncStatus onSynced={refreshData} loading={loading} />
        </aside>

        <main className="main-content">
          <LogFeedIntro />

          <StatsCards stats={stats} loading={loading} />

          <div className="controls">
            <FilterButtons filter={filter} onFilterChange={setFilter} />
            <button
              className="clear-button"
              onClick={handleClearLogs}
              disabled={loading || logs.length === 0}
            >
              Clear stored logs
            </button>
            <button
              className="realtime-button"
              onClick={() => setRealtimeOpen(true)}
            >
              🔴 Real-Time Monitoring
            </button>
          </div>

          <LogsTable logs={logs} filter={filter} loading={loading} />
        </main>
      </div>

      <RealtimeMonitor
        isOpen={realtimeOpen}
        onClose={() => setRealtimeOpen(false)}
      />
    </div>
  );
}
