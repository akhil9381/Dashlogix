import React, { useState } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";

export default function SearchPanel({ onResults }) {
  const [query, setQuery] = useState("errors last 1h");
  const [liveMode, setLiveMode] = useState(false);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const runSearch = async () => {
    setLoading(true);
    setError("");

    try {
      const { data } = await axios.get(`${API_BASE}/search`, {
        params: {
          q: query,
          limit,
          live: liveMode ? 1 : 0,
        },
      });

      setSummary({
        splQuery: data.splQuery,
        count: data.count,
        mode: data.mode,
      });

      if (onResults) {
        onResults(data.logs || []);
      }
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const presets = [
    "errors last 1h",
    "warnings last 30m",
    "host:localhost errors last 6h",
    "source:splunkd info last 1d",
  ];

  return (
    <section className="search-panel">
      <h3>Simple Log Search</h3>
      <p>
        Type plain queries like <code>errors last 1h host:web1</code>. dashlogix
        converts this into SPL rules.
      </p>

      <div className="search-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="errors last 1h host:web1"
        />
        <button type="button" onClick={runSearch} disabled={loading}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      <div className="search-options">
        <label>
          <input
            type="checkbox"
            checked={liveMode}
            onChange={(e) => setLiveMode(e.target.checked)}
          />
          Live from Splunk
        </label>

        <label>
          Max results
          <input
            type="number"
            min="1"
            max="1000"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="search-presets">
        {presets.map((preset) => (
          <button key={preset} type="button" onClick={() => setQuery(preset)}>
            {preset}
          </button>
        ))}
      </div>

      {summary && (
        <div className="search-summary">
          <div>
            <strong>Mode:</strong> {summary.mode}
          </div>
          <div>
            <strong>Matches:</strong> {summary.count}
          </div>
          <div>
            <strong>SPL:</strong> <code>{summary.splQuery}</code>
          </div>
        </div>
      )}

      {error && <div className="search-error">{error}</div>}
    </section>
  );
}
