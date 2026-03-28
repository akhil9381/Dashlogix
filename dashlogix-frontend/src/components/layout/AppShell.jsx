import React, { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../../apiConfig";
import { useAuth } from "../../context/AuthContext";

const links = [
  { to: "/", label: "Home" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/search", label: "Search" },
  { to: "/realtime", label: "Real-Time" },
  { to: "/alerts", label: "Alerts" },
  { to: "/history", label: "History" },
  { to: "/about", label: "About" },
];

export default function AppShell() {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    axios
      .post(`${API_BASE}/history/activity`, {
        type: "navigation",
        page: location.pathname,
      })
      .catch(() => {});
  }, [location.pathname, isAuthenticated]);

  return (
    <div className="cyber-app">
      <header className="topbar">
        <div className="brand-wrap">
          <Link to="/" className="brand-title">dashlogix</Link>
        </div>

        <nav className="topnav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="session-zone">
          {isAuthenticated ? (
            <>
              <NavLink to="/profile" className="session-link">{user?.name || "Profile"}</NavLink>
              <button type="button" className="session-btn" onClick={logout}>
                Logout
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="session-link">Login</NavLink>
              <NavLink to="/register" className="session-btn">Register</NavLink>
            </>
          )}
        </div>
      </header>

      <main className="page-shell">
        <Outlet />
      </main>
    </div>
  );
}
