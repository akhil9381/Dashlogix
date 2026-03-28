import React from "react";
import RealtimeMonitor from "../components/RealtimeMonitor";

export default function RealtimePage() {
  return (
    <section className="content-stack">
      <div className="page-card">
        <h2>Real-Time Monitoring</h2>
      </div>
      <RealtimeMonitor embedded />
    </section>
  );
}
