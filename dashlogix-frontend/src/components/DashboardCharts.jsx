import React from "react";

function Bars({ title, rows, color = "#4dabf7" }) {
  const max = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="chart-card">
      <h4>{title}</h4>
      <div className="bar-list">
        {rows.length === 0 && <div className="empty-chart">No data</div>}
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="bar-row">
            <div className="bar-label">{row.label}</div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${(row.count / max) * 100}%`, background: row.color || color }}
              />
            </div>
            <div className="bar-value">{row.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardCharts({ charts, timeseries }) {
  const points = timeseries?.points || [];
  const maxTotal = Math.max(...points.map((p) => p.total), 1);

  return (
    <section className="charts-grid">
      <Bars title="Severity" rows={charts?.severity || []} />
      <Bars title="Top Sources" rows={charts?.sources || []} color="#7ec8ff" />

      <div className="chart-card chart-wide">
        <h4>Traffic Trend</h4>
        <div className="sparkline-grid">
          {points.length === 0 && <div className="empty-chart">No timeseries data</div>}
          {points.map((p) => (
            <div key={p.time} className="sparkline-col" title={`${p.time} total:${p.total}`}>
              <div
                className="sparkline-bar"
                style={{ height: `${Math.max((p.total / maxTotal) * 100, 4)}%` }}
              />
            </div>
          ))}
        </div>
        {points.length > 0 && (
          <div className="sparkline-meta">
            <span>{new Date(points[0].time).toLocaleTimeString()}</span>
            <span>{new Date(points[points.length - 1].time).toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </section>
  );
}
