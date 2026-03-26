import React from "react";

export default function LogFeedIntro() {
  return (
    <div className="log-feed-intro">
      <h2>Your logs</h2>
      <p>
        New events appear here as they are collected from Splunk. Use filters
        below to focus on errors, warnings, or everything.
      </p>
    </div>
  );
}
