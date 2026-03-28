const LEVEL_PATTERNS = {
  error: /(error|failed|fatal|exception)/i,
  warning: /(warn|warning)/i,
  info: /(info|started|connected)/i,
};

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
  if (LEVEL_PATTERNS.error.test(text)) return "error";
  if (LEVEL_PATTERNS.warning.test(text)) return "warning";
  return "info";
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

  if (levelHint === "error") regexParts.push("ERROR|FAILED|EXCEPTION|FATAL");
  if (levelHint === "warning") regexParts.push("WARN|WARNING");
  if (levelHint === "info") regexParts.push("INFO");
  if (textTerms) regexParts.push(escapeRegex(textTerms));

  if (regexParts.length > 0) {
    mongoFilter.log = { $regex: new RegExp(regexParts.join("|"), "i") };
  }

  const splParts = [`search index=${index}`, `earliest=${earliest}`];

  if (hostMatch?.[1]) splParts.push(`host=${hostMatch[1]}`);
  if (sourceMatch?.[1]) splParts.push(`source=${sourceMatch[1]}`);

  if (levelHint === "error") splParts.push('("ERROR" OR "FAILED" OR "EXCEPTION" OR "FATAL")');
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
