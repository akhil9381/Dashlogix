import React from "react";

export default function StatsCards({ stats, loading }) {
  if (loading) {
    return <div className="stats-cards">Loading stats...</div>;
  }

  if (!stats) {
    return <div className="stats-cards">No stats available</div>;
  }

  return (
    <div className="stats-cards">
      <div className="stat-card">
        <div className="stat-label">Total Logs</div>
        <div className="stat-value">{stats.totalLogs || 0}</div>
      </div>
      <div className="stat-card error">
        <div className="stat-label">Errors</div>
        <div className="stat-value">{stats.errorCount || 0}</div>
      </div>
      <div className="stat-card warning">
        <div className="stat-label">Warnings</div>
        <div className="stat-value">{stats.warningCount || 0}</div>
      </div>
      <div className="stat-card info">
        <div className="stat-label">Info</div>
        <div className="stat-value">{stats.infoCount || 0}</div>
      </div>
    </div>
  );
}
