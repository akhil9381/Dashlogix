import React from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <section className="page-card hero-card">
      <h1>dashlogix</h1>
      <div className="hero-grid">
        <div>
          <h3>Visibility</h3>
          <p>Real-time stream + dashboard trends across your event sources.</p>
        </div>
        <div>
          <h3>Response</h3>
          <p>Alert rules with cron checks and SMTP notifications.</p>
        </div>
        <div>
          <h3>Auditability</h3>
          <p>User history and profile-backed access tracking in MongoDB.</p>
        </div>
      </div>
      <div className="hero-actions">
        <Link to="/dashboard" className="primary-link">Open Dashboard</Link>
        <Link to="/search" className="ghost-link">Investigate Logs</Link>
      </div>
      <div className="hero-metrics">
        <div className="hero-metric">
          <span className="kpi-label">Data Source</span>
          <strong>Splunk</strong>
        </div>
        <div className="hero-metric">
          <span className="kpi-label">Storage</span>
          <strong>MongoDB</strong>
        </div>
        <div className="hero-metric">
          <span className="kpi-label">Mode</span>
          <strong>Blue Team</strong>
        </div>
      </div>
    </section>
  );
}
