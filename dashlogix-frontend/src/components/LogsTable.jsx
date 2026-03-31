import React from "react";

export default function LogsTable({ logs, filter, loading, variant = "default" }) {
  if (loading) {
    return <div className="logs-table">Loading logs...</div>;
  }

  if (!logs || logs.length === 0) {
    return <div className="logs-table">No logs found</div>;
  }

  // 🔥 Filter logs based on selected filter
  const filteredLogs = logs.filter((log) => {
    const level = String(log.level || "").toUpperCase();
    const message = String(log.log || "").toUpperCase();

    if (filter === "ALL") return true;
    if (filter === "ERROR") return level === "ERROR" || message.includes("ERROR");
    if (filter === "WARNING") return level === "WARNING" || message.includes("WARNING");
    if (filter === "INFO")
      return (
        level === "INFO" ||
        (!message.includes("ERROR") && !message.includes("WARNING"))
      );
    return true;
  });

  return (
    <div className={`logs-container ${variant === "flat" ? "logs-container-flat" : ""}`}>
      <div className="logs-count">
        Showing {filteredLogs.length} of {logs.length} logs
      </div>
      <table className={`logs-table ${variant === "flat" ? "logs-table-flat" : ""}`}>
        <thead>
          <tr>
            <th>Time</th>
            <th>Host</th>
            <th>Source</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {filteredLogs.map((log, idx) => {
            const level = String(log.level || "").toLowerCase();
            const message = String(log.log || "");
            const isError = level === "error" || message.toUpperCase().includes("ERROR");
            const isWarning = level === "warning" || message.toUpperCase().includes("WARNING");

            return (
              <tr
                key={idx}
                className={`${isError ? "error-row" : isWarning ? "warning-row" : ""}`}
              >
                <td className="time-cell">{log.time || "-"}</td>
                <td>{log.host || "-"}</td>
                <td className="source-cell">{log.source || "-"}</td>
                <td className="message-cell">
                  <div className="log-raw">{log.log || "-"}</div>
                  {log.exactCause && <div className="log-cause">Cause: {log.exactCause}</div>}
                  {log.description && <div className="log-description">{log.description}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
