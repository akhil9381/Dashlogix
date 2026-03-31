const LEVEL_PATTERNS = {
  error: /\b(error|fatal|exception|panic|critical)\b/i,
  warning: /\b(warn|warning)\b/i,
  info: /\b(info|started|connected)\b/i,
};

function isBenignFailureMetric(text = "") {
  const message = String(text || "");

  if (!/\bfailed\s*=\s*0\b/i.test(message)) return false;
  if (/\b(error|fatal|exception|panic|critical)\b/i.test(message)) return false;

  return /\bINFO\b/i.test(message);
}

function hasMeaningfulFailure(text = "") {
  const message = String(text || "");

  if (/\b(error|fatal|exception|panic|critical)\b/i.test(message)) return true;
  if (/\bfailed\s*=\s*[1-9]\d*\b/i.test(message)) return true;
  if (/\bfailed\b/i.test(message) && !/\bfailed\s*=\s*0\b/i.test(message)) return true;

  return false;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLastWindow(text) {
  const match = text.match(/last\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days)/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith("m")) return `-${value}m`;
  if (unit.startsWith("h")) return `-${value}h`;
  return `-${value}d`;
}

function parseIntegerParam(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function classifyLogLevel(text = "") {
  if (isBenignFailureMetric(text)) return "info";
  if (hasMeaningfulFailure(text)) return "error";
  if (LEVEL_PATTERNS.warning.test(text)) return "warning";
  return "info";
}

export function extractExactCause(text = "", level = classifyLogLevel(text)) {
  const message = String(text || "").trim();

  if (isBenignFailureMetric(message)) {
    return "No actual error occurred. This log only reports that the failure count is zero.";
  }

  const hostMatch =
    message.match(/(?:ENOTFOUND|getaddrinfo)\s+([A-Za-z0-9._-]+)/i) ||
    message.match(/dns[^A-Za-z0-9]+([A-Za-z0-9._-]+\.[A-Za-z]{2,})/i);
  if (hostMatch) {
    return `The app could not find the server named "${hostMatch[1]}". This usually means the server name is wrong, old, or not available right now.`;
  }

  const refusedMatch =
    message.match(/ECONNREFUSED\s+([0-9a-zA-Z:._-]+:\d+)/i) ||
    message.match(/connect ECONNREFUSED\s+([0-9a-zA-Z:._-]+:\d+)/i);
  if (refusedMatch) {
    return `The app reached "${refusedMatch[1]}", but that service was not accepting connections. This usually means the server is stopped, restarting, or listening on a different port.`;
  }

  const inUseMatch = message.match(/(?:EADDRINUSE|address already in use).*?(\d{2,5})/i);
  if (inUseMatch) {
    return `Another app is already using port ${inUseMatch[1]}, so DashLogix cannot start its service on that same port.`;
  }

  const timeoutMatch =
    message.match(/(?:timed out|timeout|ETIMEDOUT).*?([A-Za-z0-9._-]+:\d+|[A-Za-z0-9._-]+)/i) ||
    message.match(/timeout.*?while.*?connecting.*?to\s+([A-Za-z0-9._-]+:\d+|[A-Za-z0-9._-]+)/i);
  if (timeoutMatch) {
    return `The app waited too long for a response from "${timeoutMatch[1]}". The service may be down, overloaded, blocked by the network, or taking too long to answer.`;
  }

  if (/(winsock error 10054|socket error.*10054)/i.test(message)) {
    return "The connection was closed suddenly while the app was sending or receiving data. This usually happens when the other system stops the connection or the network drops it.";
  }

  if (/(401|unauthorized|invalid credentials|authentication failed|auth failed)/i.test(message)) {
    return "The login details were rejected, so the app could not sign in. The username, password, token, or session is likely wrong or expired.";
  }

  if (/(403|forbidden)/i.test(message)) {
    return "The app was recognized, but it does not have permission to perform this action with the current account or token.";
  }

  if (/(mongo|mongoose)/i.test(message) && /(connect|connection)/i.test(message)) {
    return "The app could not connect to the database. The database server may be down, unreachable, blocked by network rules, or configured with the wrong address.";
  }

  if (/(splunk)/i.test(message) && /(login|auth|session key)/i.test(message)) {
    return "The app could not sign in to Splunk, so it could not collect or query logs. The Splunk login details or access permissions likely need to be fixed.";
  }

  if (/(not found|404)/i.test(message)) {
    return "The requested page, API path, or data record could not be found. The address may be wrong or the item may no longer exist.";
  }

  if (/(disk|no space left|enospc)/i.test(message)) {
    return "The system has no free storage space left, so the app cannot save more data until space is cleared.";
  }

  if (/(heap out of memory|out of memory|memory)/i.test(message)) {
    return "The app ran out of memory while doing its work. This usually means the task was too large or the system does not have enough memory available.";
  }

  if (/(socket error|connection reset|econnreset)/i.test(message)) {
    return "The network connection was interrupted in the middle of the request, so the app could not finish talking to the other service.";
  }

  if (/(exception while processing request)/i.test(message)) {
    return "The app hit an internal problem while handling the request, so it could not complete the operation successfully.";
  }

  if (level === "warning") {
    return "Something unexpected happened, but the app was still able to keep running.";
  }

  if (level === "error") {
    return "The operation failed because the app ran into a problem it could not recover from automatically.";
  }

  return "No problem was detected in this log entry.";
}

export function describeLogForUsers(text = "", level = classifyLogLevel(text)) {
  const message = String(text || "").trim();
  const exactCause = extractExactCause(message, level);

  if (/could not find the server named/i.test(exactCause)) {
    return "The app could not find the server address in DNS, so it could not contact that service.";
  }

  if (/was not accepting connections/i.test(exactCause)) {
    return "The target service is reachable by address, but nothing is accepting connections on that port right now.";
  }

  if (/already using port/i.test(exactCause)) {
    return "Another process is already using the required port, so this service cannot start on that port.";
  }

  if (/waited too long/i.test(exactCause)) {
    return "The request took too long to complete, so the target service may be slow, down, or blocked.";
  }

  if (/login details were rejected/i.test(exactCause)) {
    return "The login details or token are incorrect, expired, or not accepted by the target system.";
  }

  if (/does not have permission/i.test(exactCause)) {
    return "The system understood the request but blocked it because the account lacks permission.";
  }

  if (/could not connect to the database/i.test(exactCause)) {
    return "DashLogix could not reach MongoDB, so database-backed features may not work until the connection is fixed.";
  }

  if (/could not sign in to Splunk/i.test(exactCause)) {
    return "DashLogix could not authenticate with Splunk, so live log collection may fail until the credentials are fixed.";
  }

  if (/could not be found/i.test(exactCause)) {
    return "The target path, record, or endpoint does not exist at the requested location.";
  }

  if (/no free storage space/i.test(exactCause)) {
    return "The machine does not have enough free storage to continue this operation normally.";
  }

  if (/ran out of memory/i.test(exactCause)) {
    return "The process ran out of memory and may need a smaller workload or a larger memory limit.";
  }

  if (/failure count is zero/i.test(exactCause)) {
    return "This line only reports healthy metrics and should not be treated as an actual error.";
  }

  if (level === "error") {
    return "The application reported an error while processing a task. Review the raw message for the technical cause.";
  }

  if (level === "warning") {
    return "The application detected a warning. It completed something important, but there may be a condition that needs attention.";
  }

  return "This is an informational log showing normal system activity.";
}

export function parseSimpleQuery(rawQuery = "") {
  const queryText = String(rawQuery || "").trim();
  const normalized = queryText.toLowerCase();

  const indexMatch = queryText.match(/index:([\w.-]+)/i);
  const hostMatch = queryText.match(/host:([\w.-]+)/i);
  const sourceMatch = queryText.match(/source:([^\s]+)/i);
  const levelMatch = queryText.match(/level:(error|warn|warning|info)/i);
  const lastWindow = parseLastWindow(queryText);

  const explicitEarliest = queryText.match(/earliest:([^\s]+)/i)?.[1];
  const earliest = explicitEarliest || lastWindow || "-1h";

  const index = indexMatch?.[1] || process.env.SPLUNK_INDEX || "main";

  const mongoFilter = {};

  if (hostMatch?.[1]) {
    mongoFilter.host = { $regex: new RegExp(`^${escapeRegex(hostMatch[1])}$`, "i") };
  }

  if (sourceMatch?.[1]) {
    mongoFilter.source = {
      $regex: new RegExp(escapeRegex(sourceMatch[1]), "i"),
    };
  }

  const textTerms = queryText
    .replace(/index:[^\s]+/gi, "")
    .replace(/host:[^\s]+/gi, "")
    .replace(/source:[^\s]+/gi, "")
    .replace(/level:(error|warn|warning|info)/gi, "")
    .replace(/last\s+\d+\s*(m|min|mins|minute|minutes|h|hr|hour|hours|d|day|days)/gi, "")
    .replace(/earliest:[^\s]+/gi, "")
    .trim();

  const explicitLevel = levelMatch?.[1]?.toLowerCase();
  const levelHint =
    explicitLevel === "warn" || explicitLevel === "warning"
      ? "warning"
      : explicitLevel || (normalized.includes("error") ? "error" : normalized.includes("warn") ? "warning" : null);

  const regexParts = [];

  if (levelHint === "error") regexParts.push("\\bERROR\\b|\\bEXCEPTION\\b|\\bFATAL\\b|\\bFAILED\\b(?!\\s*=\\s*0)");
  if (levelHint === "warning") regexParts.push("WARN|WARNING");
  if (levelHint === "info") regexParts.push("INFO");
  if (textTerms) regexParts.push(escapeRegex(textTerms));

  if (regexParts.length > 0) {
    mongoFilter.log = { $regex: new RegExp(regexParts.join("|"), "i") };
  }

  const splParts = [`search index=${index}`, `earliest=${earliest}`];

  if (hostMatch?.[1]) splParts.push(`host=${hostMatch[1]}`);
  if (sourceMatch?.[1]) splParts.push(`source=${sourceMatch[1]}`);

  if (levelHint === "error") {
    splParts.push('("ERROR" OR "EXCEPTION" OR "FATAL" OR ("FAILED" NOT "failed=0"))');
  }
  if (levelHint === "warning") splParts.push('("WARN" OR "WARNING")');
  if (levelHint === "info") splParts.push('"INFO"');

  if (textTerms) {
    const quoted = textTerms
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => `"${part}"`)
      .join(" ");
    if (quoted) splParts.push(quoted);
  }

  return {
    queryText,
    index,
    earliest,
    levelHint,
    textTerms,
    mongoFilter,
    splQuery: splParts.join(" "),
  };
}

export function buildTimeRangeFilter(earliest = "-1h") {
  const now = Date.now();
  const match = String(earliest).match(/-?(\d+)([mhd])/i);

  if (!match) {
    return { $gte: new Date(now - 60 * 60 * 1000) };
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  const multiplier =
    unit === "m" ? 60 * 1000 : unit === "h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  return { $gte: new Date(now - amount * multiplier) };
}

export function resolveSearchOptions(query) {
  return {
    limit: parseIntegerParam(query.limit, 100, 1, 1000),
    live: String(query.live || "0") === "1",
  };
}
