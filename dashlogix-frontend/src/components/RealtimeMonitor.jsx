import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";
import "./RealtimeMonitor.css";

export default function RealtimeMonitor({ isOpen = true, onClose, embedded = false }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState("_internal");
  const [limit, setLimit] = useState(100);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);

  const buildWebSocketUrl = () => {
    const explicitWsUrl = String(import.meta.env.VITE_WS_URL || "").trim();
    if (explicitWsUrl) return explicitWsUrl;

    const configuredPort = String(import.meta.env.VITE_WS_PORT || "").trim();
    const isSecure = window.location.protocol === "https:";
    const wsProtocol = isSecure ? "wss" : "ws";

    if (configuredPort) {
      return `${wsProtocol}://${window.location.hostname}:${configuredPort}`;
    }

    const explicitApi = String(import.meta.env.VITE_API_URL || "").trim();
    if (explicitApi) {
      try {
        const apiUrl = new URL(explicitApi);
        return `${apiUrl.protocol === "https:" ? "wss" : "ws"}://${apiUrl.hostname}:${apiUrl.port || (apiUrl.protocol === "https:" ? "443" : "80")}`;
      } catch {
        // ignore and fallback
      }
    }

    if (import.meta.env.DEV) {
      return `${wsProtocol}://${window.location.hostname}:5001`;
    }

    return `${wsProtocol}://${window.location.host}`;
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const connectWebSocket = () => {
    if (wsRef.current) return;

    try {
      const ws = new WebSocket(buildWebSocketUrl());

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "logEvent") {
            setLogs((prev) => [data.data, ...prev].slice(0, 1000));
            return;
          }

          if (data.type === "realtimeStarted") {
            setIsMonitoring(true);
            return;
          }

          if (data.type === "realtimeStopped") {
            setIsMonitoring(false);
            return;
          }

          if (data.type === "error") {
            setError(data.message || "Realtime stream error");
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection failed");
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
        setIsMonitoring(false);
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (err) {
      setError(err.message || "WebSocket initialization failed");
    }
  };

  const startRealtime = async () => {
    try {
      setError(null);
      setLogs([]);
      connectWebSocket();

      await axios.post(`${API_BASE}/realtime-start`, {
        index,
        limit: Math.min(Math.max(Number(limit || 100), 1), 1000),
      });
      setIsMonitoring(true);
    } catch (err) {
      setError(err.response?.data?.details || err.message);
    }
  };

  const stopRealtime = async () => {
    try {
      await axios.post(`${API_BASE}/realtime-stop`);
    } catch {
      // best effort stop
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsMonitoring(false);
    setLogs([]);
  };

  const sendPing = () => {
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  };

  if (!embedded && !isOpen) return null;

  const monitorCard = (
    <div className="realtime-monitor" onClick={(e) => e.stopPropagation()}>
      <div className="realtime-header">
        <h2>Real-Time Log Monitor</h2>
        {!embedded && (
          <button className="close-btn" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="realtime-controls">
        <div className="control-group">
          <label>Splunk Index:</label>
          <input
            type="text"
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            placeholder="_internal"
            disabled={isMonitoring}
          />
        </div>

        <div className="control-group">
          <label>Limit:</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            min="1"
            max="1000"
            disabled={isMonitoring}
          />
        </div>

        <div className="control-group">
          {!isMonitoring ? (
            <button className="btn btn-primary" onClick={startRealtime}>
              Start Monitoring
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopRealtime}>
              Stop Monitoring
            </button>
          )}
        </div>

        <div className="control-group">
          <button className="btn btn-secondary" onClick={sendPing}>
            Ping
          </button>
        </div>

        <div className="status-indicator">
          <span className={`indicator ${isConnected ? "connected" : ""}`}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          {isMonitoring && <span className="monitoring-badge">Monitoring</span>}
        </div>
      </div>

      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="realtime-logs">
        <div className="logs-header">
          <h3>Live Logs ({logs.length})</h3>
          <div className="logs-meta">
            {logs.length > 0 && (
              <small>Latest: {new Date(logs[0].time).toLocaleTimeString()}</small>
            )}
          </div>
        </div>

        <div className="realtime-stream-container">
          {logs.length === 0 ? (
            <div className="empty-logs">
              {isMonitoring ? "Waiting for logs..." : "No logs yet"}
            </div>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="log-item">
                <div className="log-meta">
                  <span className="log-time">{new Date(log.time).toLocaleTimeString()}</span>
                  <span className="log-host">{log.host}</span>
                  <span className="log-source">{log.source}</span>
                </div>
                <div className="log-content">{log.log}</div>
                {log.exactCause && <div className="log-exact-cause">Cause: {log.exactCause}</div>}
                {log.description && <div className="log-friendly-description">{log.description}</div>}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );

  if (embedded) return <div className="realtime-embedded">{monitorCard}</div>;

  return (
    <div className="realtime-monitor-overlay" onClick={onClose}>
      {monitorCard}
    </div>
  );
}
