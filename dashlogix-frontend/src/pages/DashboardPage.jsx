import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";
import SyncStatus from "../components/SyncStatus";
import StatsCards from "../components/StatsCards";
import DashboardCharts from "../components/DashboardCharts";
import LogsTable from "../components/LogsTable";
import FilterButtons from "../components/FilterButtons";

export default function DashboardPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [mySummary, setMySummary] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [logsRes, statsRes, chartsRes, seriesRes] = await Promise.all([
        axios.get(`${API_BASE}/stored-logs`, { params: { limit: 250 } }),
        axios.get(`${API_BASE}/stats`),
        axios.get(`${API_BASE}/stats/charts`),
        axios.get(`${API_BASE}/stats/timeseries`, { params: { minutes: 120, bucketMinutes: 5 } }),
      ]);

      setLogs(logsRes.data || []);
      setStats(statsRes.data || null);
      setCharts(chartsRes.data || null);
      setTimeseries(seriesRes.data || null);

      try {
        const summaryRes = await axios.get(`${API_BASE}/dashboard/my-summary`);
        setMySummary(summaryRes.data || null);
      } catch {
        setMySummary(null);
      }
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="page-grid">
      <aside className="sidebar-card">
        <SyncStatus onSynced={refresh} loading={loading} />
      </aside>

      <div className="content-stack">
        {error && <div className="form-error">{error}</div>}
        {mySummary && (
          <div className="page-card">
            <h3>Welcome back, {mySummary.user?.name}</h3>
            <div className="rule-sub">
              active alert rules: {mySummary.totals?.activeAlertRules || 0}
            </div>
            <div className="rule-sub">
              searches: {mySummary.totals?.totalSearches || 0}
            </div>
            <div className="rule-sub">
              triggered alert events: {mySummary.totals?.triggeredEvents || 0}
            </div>
          </div>
        )}
        <StatsCards stats={stats} loading={loading} />
        <DashboardCharts charts={charts} timeseries={timeseries} />

        <div className="control-row">
          <FilterButtons filter={filter} onFilterChange={setFilter} />
          <button type="button" className="action-btn" onClick={refresh}>Refresh</button>
        </div>

        <LogsTable logs={logs} filter={filter} loading={loading} />
      </div>
    </section>
  );
}
