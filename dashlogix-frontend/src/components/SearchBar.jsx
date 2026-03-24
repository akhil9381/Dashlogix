import React from "react";

export default function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = React.useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query);
      setQuery("");
    }
  };

  return (
    <div className="search-bar">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Enter SPL query (e.g., index=main ERROR)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          className="search-input"
        />
        <button type="submit" disabled={loading} className="search-button">
          {loading ? "Searching..." : "Search"}
        </button>
      </form>
    </div>
  );
}
