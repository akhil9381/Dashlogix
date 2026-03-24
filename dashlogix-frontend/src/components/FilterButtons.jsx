import React from "react";

export default function FilterButtons({ filter, onFilterChange }) {
  const filters = ["ALL", "ERROR", "WARNING", "INFO"];

  return (
    <div className="filter-buttons">
      {filters.map((f) => (
        <button
          key={f}
          className={`filter-btn ${filter === f ? "active" : ""}`}
          onClick={() => onFilterChange(f)}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
