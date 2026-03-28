import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../apiConfig";

const initialForm = {
  name: "Error spike",
  queryText: "last 5m",
  metricType: "error",
  threshold: 20,
  errorThreshold: 20,
  warningThreshold: 0,
  windowMinutes: 5,
  checkEveryMinutes: 1,
  cooldownMinutes: 10,
  autoEmail: false,
  enabled: true,
};

export default function AlertManager() {
  const [form, setForm] = useState(initialForm);
  const [rules, setRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = async () => {
    try {
      const [rulesRes, eventsRes] = await Promise.all([
        axios.get(`${API_BASE}/alerts/rules`),
        axios.get(`${API_BASE}/alerts/events`),
      ]);
      setRules(rulesRes.data || []);
      setEvents(eventsRes.data || []);
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createRule = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      await axios.post(`${API_BASE}/alerts/rules`, form);
      setForm(initialForm);
      setNotice("Alert rule created.");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (rule) => {
    try {
      setError("");
      setNotice("");
      await axios.patch(`${API_BASE}/alerts/rules/${rule._id}`, {
        enabled: !rule.enabled,
      });
      setNotice(`Rule ${!rule.enabled ? "enabled" : "disabled"}.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    }
  };

  const runNow = async (ruleId) => {
    try {
      setError("");
      setNotice("");
      const { data } = await axios.post(`${API_BASE}/alerts/run-now/${ruleId}`);
      if (data?.emailAttempted === undefined) {
        setNotice("Run now executed, but backend response is outdated. Restart backend to enable forced email test.");
        await loadData();
        return;
      }
      if (data?.emailSent) {
        setNotice("Run now executed and email sent.");
      } else if (data?.emailAttempted) {
        setNotice(
          `Run now executed, but email failed: ${data?.emailReason || "unknown error"}`
        );
      } else {
        setNotice("Run now executed. Email was not attempted.");
      }
      await loadData();
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    }
  };

  const toggleAutoEmail = async (rule) => {
    try {
      setError("");
      setNotice("");
      await axios.patch(`${API_BASE}/alerts/rules/${rule._id}`, {
        autoEmail: !rule.autoEmail,
      });
      setNotice(`Auto email ${!rule.autoEmail ? "enabled" : "disabled"} for this rule.`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    }
  };

  const removeRule = async (ruleId) => {
    try {
      setError("");
      setNotice("");
      await axios.delete(`${API_BASE}/alerts/rules/${ruleId}`);
      setNotice("Rule deleted.");
      await loadData();
    } catch (err) {
      setError(err.response?.data?.details || err.response?.data?.error || err.message);
    }
  };

  return (
    <section className="alerts-panel">
      <h3>Alert Rules</h3>
      <p>Threshold alerts run on schedule. Emails are sent to your registered account email.</p>

      <form className="alerts-form" onSubmit={createRule}>
        <div className="form-field form-field-wide">
          <label className="field-label" htmlFor="alert-name">Rule name</label>
          <input
            id="alert-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Rule name"
            required
          />
        </div>

        <div className="form-field form-field-wide">
          <label className="field-label" htmlFor="alert-query">Query</label>
          <input
            id="alert-query"
            value={form.queryText}
            onChange={(e) => setForm((p) => ({ ...p, queryText: e.target.value }))}
            placeholder="last 5m host:web1"
            required
          />
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="alert-error-threshold">Error threshold</label>
          <input
            id="alert-error-threshold"
            type="number"
            min="0"
            value={form.errorThreshold}
            onChange={(e) =>
              setForm((p) => ({ ...p, errorThreshold: Number(e.target.value) }))
            }
            placeholder="Error threshold"
          />
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="alert-warning-threshold">Warning threshold</label>
          <input
            id="alert-warning-threshold"
            type="number"
            min="0"
            value={form.warningThreshold}
            onChange={(e) =>
              setForm((p) => ({ ...p, warningThreshold: Number(e.target.value) }))
            }
            placeholder="Warning threshold"
          />
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="alert-legacy-threshold">Legacy threshold</label>
          <input
            id="alert-legacy-threshold"
            type="number"
            min="1"
            value={form.threshold}
            onChange={(e) => setForm((p) => ({ ...p, threshold: Number(e.target.value) }))}
            placeholder="Threshold"
            required
          />
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="alert-window">Window (minutes)</label>
          <input
            id="alert-window"
            type="number"
            min="1"
            value={form.windowMinutes}
            onChange={(e) => setForm((p) => ({ ...p, windowMinutes: Number(e.target.value) }))}
            placeholder="Window min"
            required
          />
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="alert-check-every">Check every (minutes)</label>
          <input
            id="alert-check-every"
            type="number"
            min="1"
            value={form.checkEveryMinutes}
            onChange={(e) => setForm((p) => ({ ...p, checkEveryMinutes: Number(e.target.value) }))}
            placeholder="Check every min"
            required
          />
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="alert-cooldown">Cooldown (minutes)</label>
          <input
            id="alert-cooldown"
            type="number"
            min="1"
            value={form.cooldownMinutes}
            onChange={(e) => setForm((p) => ({ ...p, cooldownMinutes: Number(e.target.value) }))}
            placeholder="Cooldown min"
            required
          />
        </div>

        <label className="checkbox-row form-field-wide" htmlFor="alert-auto-email">
          <input
            id="alert-auto-email"
            type="checkbox"
            checked={form.autoEmail}
            onChange={(e) => setForm((p) => ({ ...p, autoEmail: e.target.checked }))}
          />
          Auto-send email when threshold is hit
        </label>
        <button className="form-field-wide" type="submit" disabled={loading}>
          {loading ? "Saving..." : "Create alert"}
        </button>
      </form>

      {error && <div className="search-error">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="rule-list">
        {rules.length === 0 && <div className="empty-chart">No rules yet</div>}
        {rules.map((rule) => (
          <div key={rule._id} className="rule-item">
            <div>
              <strong>{rule.name}</strong>
              <div className="rule-sub">{rule.queryText}</div>
              <div className="rule-sub">
                thresholds: errors {rule.errorThreshold ?? 0}, warnings {rule.warningThreshold ?? 0}
              </div>
              <div className="rule-sub">
                legacy threshold: {rule.metricType || "error"} {rule.threshold} in {rule.windowMinutes}m, every {rule.checkEveryMinutes}m
              </div>
              <div className="rule-sub">
                rule status: {rule.enabled ? "enabled" : "disabled"}
              </div>
              <div className="rule-sub">
                email mode: {rule.autoEmail ? "auto-send enabled" : "auto-send disabled"}
              </div>
            </div>
            <div className="rule-actions">
              <button type="button" onClick={() => toggleRule(rule)}>
                {rule.enabled ? "Disable Rule" : "Enable Rule"}
              </button>
              <button type="button" onClick={() => toggleAutoEmail(rule)}>
                {rule.autoEmail ? "Disable Email" : "Enable Email"}
              </button>
              <button type="button" onClick={() => runNow(rule._id)}>Run now</button>
              <button type="button" onClick={() => removeRule(rule._id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div className="event-list">
        <h4>Recent Alert Events</h4>
        {events.length === 0 && <div className="empty-chart">No events yet</div>}
        {events.map((event) => (
          <div key={event._id} className="event-item">
            <span>{new Date(event.createdAt).toLocaleString()}</span>
            <span>{event.ruleName}</span>
            <span>
              errors {event.errorCount ?? 0}, warnings {event.warningCount ?? 0}
            </span>
            <span>{event.emailSent ? "email sent" : event.error || "no email"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
