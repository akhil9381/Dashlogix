import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();

  return (
    <section className="home-simple">
      <div className="home-simple-layout">
        <div className="page-card hero-card home-simple-card">
          <div className="hero-badge">DashLogix</div>
          <h1>{isAuthenticated ? `Welcome back, ${user?.name || "Operator"}` : "Simple log monitoring, made clearer."}</h1>
          <p className="hero-lead">
            Monitor Splunk logs, search incidents, and understand failures with simpler explanations from one workspace.
          </p>

          <div className="hero-actions">
            <Link to={isAuthenticated ? "/dashboard" : "/login"} className="primary-link">
              {isAuthenticated ? "Open Dashboard" : "Sign In"}
            </Link>
            <Link to="/search" className="ghost-link">Search Logs</Link>
            <Link to="/realtime" className="ghost-link">Real-Time View</Link>
          </div>
        </div>

        <div className="home-simple-grid">
          <div className="page-card home-mini-card">
            <h3>Dashboard</h3>
            <p>See recent logs, trends, and system activity in one place.</p>
          </div>

          <div className="page-card home-mini-card">
            <h3>Search</h3>
            <p>Search logs quickly using simple terms like errors, warnings, or time ranges.</p>
          </div>

          <div className="page-card home-mini-card">
            <h3>Real-Time</h3>
            <p>Watch live events as they arrive and spot issues faster.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
