import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";
import "./RealtimeMonitor.css";

export default function RealtimeMonitor({ isOpen, onClose }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState("_internal");
  const [limit, setLimit] = useState(100);
  const wsRef = useRef(null);
  const logsEndRef = useRef(null);

  // Auto-scroll to bottom when new logs arrive
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [logs]);

  const connectWebSocket = () => {
    if (wsRef.current) return;

    try {
      const wsUrl = `ws://localhost:${process.env.VITE_WS_PORT || 5001}`;
      console.log(`🔗 Connecting to WebSocket: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "logEvent":
              setLogs((prev) => [data.data, ...prev].slice(0, 1000)); // Keep last 1000
              break;
            case "realtimeStarted":
              console.log(`🔴 Real-time search started: ${data.jobSid}`);
              setIsMonitoring(true);
              break;
            case "searchComplete":
              console.log("✅ Real-time search completed");
              break;
            case "error":
              console.error("WebSocket error:", data.message);
              setError(data.message);
              break;
            case "pong":
              console.log("📡 Pong received");
              break;
            default:
              console.log("Unknown message type:", data.type);
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("❌ WebSocket error:", err);
        setError("WebSocket connection failed");
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log("🔌 WebSocket disconnected");
        setIsConnected(false);
        setIsMonitoring(false);
        wsRef.current = null;
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("Failed to connect WebSocket:", err);
      setError(err.message);
    }
  };

  const startRealtime = async () => {
    try {
      setError(null);
      setLogs([]);

      // Connect WebSocket first
      connectWebSocket();

      // Then start real-time search via REST API
      const response = await axios.post(`${API_BASE}/realtime-start`, {
        index,
        limit: Math.min(limit, 1000),
      });

      console.log("✅ Real-time monitoring started:", response.data);
    } catch (err) {
      console.error("Error starting real-time monitoring:", err);
      setError(err.response?.data?.details || err.message);
    }
  };

  const stopRealtime = () => {
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

  if (!isOpen) return null;

  return (
    <div className="realtime-monitor-overlay" onClick={onClose}>
      <div className="realtime-monitor" onClick={(e) => e.stopPropagation()}>
        <div className="realtime-header">
          <h2>🔴 Real-Time Log Monitor</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
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
                🚀 Start Monitoring
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopRealtime}>
                ⛔ Stop Monitoring
              </button>
            )}
          </div>

          <div className="control-group">
            <button className="btn btn-secondary" onClick={sendPing}>
              📡 Ping
            </button>
          </div>

          <div className="status-indicator">
            <span className={`indicator ${isConnected ? "connected" : ""}`}>
              {isConnected ? "🟢" : "🔴"} {isConnected ? "Connected" : "Disconnected"}
            </span>
            {isMonitoring && <span className="monitoring-badge">📊 Monitoring</span>}
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

          <div className="logs-container">
            {logs.length === 0 ? (
              <div className="empty-logs">
                {isMonitoring ? "Waiting for logs..." : "No logs yet"}
              </div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="log-item">
                  <div className="log-meta">
                    <span className="log-time">
                      {new Date(log.time).toLocaleTimeString()}
                    </span>
                    <span className="log-host">{log.host}</span>
                    <span className="log-source">{log.source}</span>
                  </div>
                  <div className="log-content">{log.log}</div>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
