import React from "react";
import AlertManager from "../components/AlertManager";

export default function AlertsPage() {
  return (
    <section className="content-stack">
      <div className="page-card">
        <h2>Alert Command Center</h2>
      </div>
      <AlertManager />
    </section>
  );
}
