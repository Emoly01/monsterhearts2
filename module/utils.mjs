/** Escape a string for safe interpolation into HTML. */
export function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

/**
 * Case-insensitive name equality, used wherever String rows are merged so
 * "kayla" and "Kayla" land on the same row (matching how actors and the
 * Strings Web already resolve names).
 */
export function sameName(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}
