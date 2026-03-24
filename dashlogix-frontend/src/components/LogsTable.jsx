import React from "react";

export default function LogsTable({ logs, filter, loading }) {
  if (loading) {
    return <div className="logs-table">Loading logs...</div>;
  }

  if (!logs || logs.length === 0) {
    return <div className="logs-table">No logs found</div>;
  }

  // 🔥 Filter logs based on selected filter
  const filteredLogs = logs.filter((log) => {
    if (filter === "ALL") return true;
    if (filter === "ERROR") return log.log?.toUpperCase().includes("ERROR");
    if (filter === "WARNING") return log.log?.toUpperCase().includes("WARNING");
    if (filter === "INFO")
      return (
        !log.log?.toUpperCase().includes("ERROR") &&
        !log.log?.toUpperCase().includes("WARNING")
      );
    return true;
  });

  return (
    <div className="logs-container">
      <div className="logs-count">
        Showing {filteredLogs.length} of {logs.length} logs
      </div>
      <table className="logs-table">
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
            const isError = log.log?.toUpperCase().includes("ERROR");
            const isWarning = log.log?.toUpperCase().includes("WARNING");

            return (
              <tr
                key={idx}
                className={`${isError ? "error-row" : isWarning ? "warning-row" : ""}`}
              >
                <td className="time-cell">{log.time || "-"}</td>
                <td>{log.host || "-"}</td>
                <td className="source-cell">{log.source || "-"}</td>
                <td className="message-cell">{log.log || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
