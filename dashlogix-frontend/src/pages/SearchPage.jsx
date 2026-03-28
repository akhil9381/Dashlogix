import React, { useState } from "react";
import SearchPanel from "../components/SearchPanel";
import LogsTable from "../components/LogsTable";
import FilterButtons from "../components/FilterButtons";

export default function SearchPage() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");

  return (
    <section className="content-stack">
      <div className="page-card">
        <h2>Search Investigation</h2>
      </div>
      <SearchPanel onResults={setLogs} />
      <div className="control-row">
        <FilterButtons filter={filter} onFilterChange={setFilter} />
      </div>
      <LogsTable logs={logs} filter={filter} loading={false} />
    </section>
  );
}
