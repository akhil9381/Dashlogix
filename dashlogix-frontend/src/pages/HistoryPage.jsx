import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";

export default function HistoryPage() {
  const [searchRows, setSearchRows] = useState([]);
  const [activityRows, setActivityRows] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/history/search`, { params: { limit: 120 } }),
      axios.get(`${API_BASE}/history/activity`, { params: { limit: 120 } }),
    ])
      .then(([searchRes, activityRes]) => {
        setSearchRows(searchRes.data || []);
        setActivityRows(activityRes.data || []);
      })
      .catch((err) => {
        setError(err.response?.data?.details || err.response?.data?.error || err.message);
      });
  }, []);

  return (
    <section className="content-stack">
      <div className="page-card">
        <h2>User History</h2>
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="page-card">
        <h3>Search History</h3>
        <div className="history-table">
          <div className="history-head">
            <span>Time</span><span>Query</span><span>SPL</span><span>Mode</span><span>Count</span>
          </div>
          {searchRows.map((row) => (
            <div className="history-row" key={row._id}>
              <span>{new Date(row.createdAt).toLocaleString()}</span>
              <span>{row.queryText}</span>
              <span>{row.splQuery}</span>
              <span>{row.mode}</span>
              <span>{row.resultCount}</span>
            </div>
          ))}
          {searchRows.length === 0 && <div className="empty-chart">No search history yet</div>}
        </div>
      </div>

      <div className="page-card">
        <h3>Activity History</h3>
        <div className="history-table">
          <div className="history-head">
            <span>Time</span><span>Type</span><span>Page</span><span>Details</span>
          </div>
          {activityRows.map((row) => (
            <div className="history-row" key={row._id}>
              <span>{new Date(row.createdAt).toLocaleString()}</span>
              <span>{row.type}</span>
              <span>{row.page}</span>
              <span>{JSON.stringify(row.details || {})}</span>
            </div>
          ))}
          {activityRows.length === 0 && <div className="empty-chart">No activity history yet</div>}
        </div>
      </div>
    </section>
  );
}
