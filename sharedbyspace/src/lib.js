export const TYPES = [
  { value: "all", label: "Everything" },
  { value: "youtube", label: "YouTube" },
  { value: "tweet", label: "X Posts" },
  { value: "instagram", label: "Instagram" },
  { value: "article", label: "Articles" },
  { value: "screenshot", label: "Screenshots" },
  { value: "reference", label: "References" },
  { value: "hook", label: "Hooks" },
  { value: "reaction", label: "Reactions" },
  { value: "idea", label: "Loose ideas" }
];

export function detectType(url = "", forcedType) {
  if (forcedType && forcedType !== "auto") return forcedType;
  if (/youtu\.be|youtube\.com/i.test(url)) return "youtube";
  if (/(twitter|x)\.com/i.test(url)) return "tweet";
  if (/instagram\.com/i.test(url)) return "instagram";
  return url ? "article" : "idea";
}

export function cleanCategories(value) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

export function timeAgo(timestamp) {
  if (!timestamp) return "Just now";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const days = Math.round((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export function apiUrl() {
  return "https://us-central1-sharedbyspace.cloudfunctions.net/agentApi";
}
