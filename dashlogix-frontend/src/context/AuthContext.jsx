import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("dashlogix_token") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common.Authorization = `Bearer ${token}`;
      localStorage.setItem("dashlogix_token", token);
    } else {
      delete axios.defaults.headers.common.Authorization;
      localStorage.removeItem("dashlogix_token");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    let ignore = false;
    setLoading(true);

    axios
      .get(`${API_BASE}/auth/me`)
      .then((res) => {
        if (!ignore) setUser(res.data || null);
      })
      .catch(() => {
        if (!ignore) {
          setToken("");
          setUser(null);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API_BASE}/auth/login`, { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async ({ name, email, password }) => {
    const { data } = await axios.post(`${API_BASE}/auth/register`, {
      name,
      email,
      password,
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const updateProfile = async (payload) => {
    const { data } = await axios.patch(`${API_BASE}/auth/profile`, payload);
    setUser(data);
    return data;
  };

  const logout = () => {
    setToken("");
    setUser(null);
  };

  const value = useMemo(
    () => ({ token, user, loading, isAuthenticated: Boolean(token), login, register, logout, updateProfile }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
