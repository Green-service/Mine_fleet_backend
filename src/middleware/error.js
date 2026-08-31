export function notFound(_req, res) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, _req, res, _next) {
  console.error(err);
  if (err.type === "entity.too.large") {
    res.status(413).json({
      error: "Upload is too large. Use fewer or smaller photos (max 2 MB each).",
    });
    return;
  }
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
}
