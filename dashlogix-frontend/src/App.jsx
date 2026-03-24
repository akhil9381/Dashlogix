import React, { useState, useEffect } from "react";
import axios from "axios";
import SearchBar from "./components/SearchBar";
import FilterButtons from "./components/FilterButtons";
import StatsCards from "./components/StatsCards";
import LogsTable from "./components/LogsTable";
import SearchHistory from "./components/SearchHistory";
import "./App.css";

const BACKEND_URL = "http://localhost:5000";

export default function App() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState(null);

  // 🔥 Fetch stored logs on component mount
  useEffect(() => {
    fetchStoredLogs();
    fetchStats();
  }, []);

  // 🔥 Fetch stored logs from database
  const fetchStoredLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${BACKEND_URL}/stored-logs`);
      setLogs(response.data || []);
      console.log("✅ Fetched stored logs:", response.data.length);
    } catch (err) {
      console.error("Error fetching stored logs:", err);
      setError("Failed to load stored logs. Make sure backend is running.");
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Fetch stats
  const fetchStats = async () => {
    try {
      const response = await axios.get(`${BACKEND_URL}/stats`);
      setStats(response.data);
      console.log("✅ Fetched stats:", response.data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  // 🔥 Handle search
  const handleSearch = async (query) => {
    setLoading(true);
    setError(null);
    setFilter("ALL");

    try {
      const response = await axios.get(`${BACKEND_URL}/logs`, {
        params: { q: query },
      });
      setLogs(response.data || []);
      console.log("✅ Search completed. Found:", response.data.length, "logs");
      await fetchStats();
      await fetchStoredLogs();
    } catch (err) {
      console.error("Error searching:", err);
      setError(
        err.response?.data?.details ||
          "Search failed. Check backend connection and Splunk credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Handle clear logs
  const handleClearLogs = async () => {
    if (window.confirm("Are you sure you want to clear all stored logs?")) {
      try {
        await axios.delete(`${BACKEND_URL}/logs`);
        setLogs([]);
        await fetchStats();
        console.log("✅ Logs cleared");
      } catch (err) {
        console.error("Error clearing logs:", err);
        setError("Failed to clear logs");
      }
    }
  };

  // 🔥 Handle history selection
  const handleSelectQuery = (query) => {
    handleSearch(query);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📊 DashLogix - Log Monitoring & Analytics</h1>
        <p>Real-time Splunk log monitoring with MongoDB persistence</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-container">
        <aside className="sidebar">
          <SearchHistory onSelectQuery={handleSelectQuery} loading={loading} />
        </aside>

        <main className="main-content">
          <SearchBar onSearch={handleSearch} loading={loading} />

          <StatsCards stats={stats} loading={loading} />

          <div className="controls">
            <FilterButtons filter={filter} onFilterChange={setFilter} />
            <button
              className="clear-button"
              onClick={handleClearLogs}
              disabled={loading || logs.length === 0}
            >
              🗑️ Clear Logs
            </button>
          </div>

          <LogsTable logs={logs} filter={filter} loading={loading} />
        </main>
      </div>
    </div>
  );
}
