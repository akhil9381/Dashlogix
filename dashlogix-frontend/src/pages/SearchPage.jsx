import React, { useState } from "react";
import SearchPanel from "../components/SearchPanel";
import LogsTable from "../components/LogsTable";

export default function SearchPage() {
  const [logs, setLogs] = useState([]);

  return (
    <section className="content-stack">
      <div className="page-card">
        <h2>Search Investigation</h2>
      </div>
      <SearchPanel onResults={setLogs} />
      <LogsTable logs={logs} filter="ALL" loading={false} variant="flat" />
    </section>
  );
}
