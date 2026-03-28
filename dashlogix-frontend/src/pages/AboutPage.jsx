import React from "react";

export default function AboutPage() {
  return (
    <section className="content-stack">
      <div className="page-card">
        <h2>About dashlogix</h2>
      </div>

      <div className="page-card">
        <h3>Platform Overview</h3>
        <p>
          dashlogix is a professional log operations platform that centralizes
          Splunk ingestion, real-time monitoring, alert automation, and analyst
          investigation workflows in a single application. The product is
          designed for teams that need fast operational visibility and reliable
          response workflows without sacrificing traceability.
        </p>
      </div>

      <div className="page-card">
        <h3>Core Capabilities</h3>
        <ul className="about-list">
          <li>Continuous and on-demand log collection from Splunk sources</li>
          <li>Live stream monitoring through WebSocket-driven real-time views</li>
          <li>Rule-based search and translation from plain queries to SPL</li>
          <li>Dashboard analytics with time-series and severity distributions</li>
          <li>
            Threshold-based alerting with independent error/warning conditions
          </li>
          <li>
            Automated notification workflow that delivers alerts to each
            registered account email
          </li>
        </ul>
      </div>

      <div className="page-card">
        <h3>Security And Governance</h3>
        <p>
          dashlogix enforces authenticated access, user-level alert ownership,
          and individual history tracking for search and activity records.
          Operational artifacts are persisted in MongoDB to support auditability,
          accountability, and controlled collaboration across multiple users.
        </p>
      </div>

      <div className="page-card">
        <h3>Operational Value</h3>
        <p>
          By combining data collection, analysis, alerting, and user-specific
          context, dashlogix shortens detection-to-action time and improves the
          consistency of security operations. The platform is built to support
          daily SOC execution, structured incident triage, and long-term
          observability maturity.
        </p>
      </div>
    </section>
  );
}
