import React, { useEffect, useState } from "react";
import axios from "axios";

const BACKEND_URL = "http://localhost:5000";

export default function SearchHistory({ onSelectQuery, loading }) {
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await axios.get(`${BACKEND_URL}/history`);
      setHistory(response.data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  if (historyLoading) {
    return <div className="search-history">Loading history...</div>;
  }

  if (!history || history.length === 0) {
    return <div className="search-history">No search history</div>;
  }

  return (
    <div className="search-history">
      <h3>Recent Searches</h3>
      <div className="history-list">
        {history.map((item, idx) => (
          <button
            key={idx}
            className="history-item"
            onClick={() => onSelectQuery(item.query)}
            disabled={loading}
            title={item.query}
          >
            <span className="history-query">{item.query}</span>
            <span className="history-time">
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
