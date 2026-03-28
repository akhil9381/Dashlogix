import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";

export default function SyncStatus({ onSynced, loading }) {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_BASE}/sync-status`);
      setStatus(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(
        e.response?.data?.hint ||
          e.message ||
          "Could not reach the API. Start the backend and open the app via http://localhost:3000."
      );
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await axios.post(`${API_BASE}/collect`);
      setLoadError(null);
      await fetchStatus();
      if (onSynced) await onSynced();
    } catch (e) {
      const d = e.response?.data;
      setLoadError(
        d?.hint || d?.details || d?.error || e.message || "Sync failed"
      );
    } finally {
      setSyncing(false);
    }
  };

  const busy = loading || syncing;

  return (
    <div className="sync-status">
      <h3>Log collection</h3>
      <p className="sync-status-intro">
        dashlogix pulls events from Splunk for you on a schedule. You do not
        need to know SPL or Splunk search syntax.
      </p>

      <button
        type="button"
        className="sync-now-button"
        onClick={handleSyncNow}
        disabled={busy}
      >
        {syncing ? "Syncing…" : "Sync now"}
      </button>

      {loadError && <div className="sync-status-error">{loadError}</div>}

      {status && status.mongoConnected === false && (
        <div className="sync-status-error">
          Database disconnected — logs cannot load until MongoDB connects. Check
          the backend terminal and Atlas network access.
        </div>
      )}

      {status && (
        <dl className="sync-status-details">
          <div>
            <dt>Last sync</dt>
            <dd>
              {status.lastSyncAt
                ? new Date(status.lastSyncAt).toLocaleString()
                : "Not yet"}
            </dd>
          </div>
          <div>
            <dt>Last batch</dt>
            <dd>
              {status.lastFetched} from Splunk, {status.lastIngested} new in
              database
            </dd>
          </div>
          <div>
            <dt>Auto interval</dt>
            <dd>{Math.round(status.intervalMs / 1000)} seconds</dd>
          </div>
          {status.source && (
            <div>
              <dt>Source scope</dt>
              <dd>
                Index <code>{status.source.index}</code>, last{" "}
                <code>{status.source.timeWindow}</code>, up to{" "}
                {status.source.maxEvents} events
              </dd>
            </div>
          )}
          {status.lastError && (
            <div className="sync-splunk-error">
              <dt>Last error</dt>
              <dd>{status.lastError}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
