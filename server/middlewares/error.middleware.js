function errorHandler(err, req, res, next) {
  console.error("❌ Error no controlado:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    ok: false,
    error: err.message || "Error interno del servidor"
  });
}

module.exports = {
  errorHandler
};
