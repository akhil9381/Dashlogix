import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await register({ name, email, password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page-card auth-card">
      <h2>Register</h2>
      <form onSubmit={onSubmit} className="auth-form">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
        <input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 chars)" required />
        <button type="submit" disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
      </form>
      {error && <p className="form-error">{error}</p>}
      <p className="auth-foot">Already registered? <Link to="/login">Sign in</Link></p>
    </section>
  );
}
