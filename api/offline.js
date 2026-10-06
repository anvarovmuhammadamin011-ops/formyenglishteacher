// Vercel serverless fallback for /api and /uploads while the backend is not
// deployed. Returns a clean JSON error (any method) so the SPA shows a
// readable toast instead of 405/HTML error pages. On 200-empty the client's
// `request()` would silently resolve, hence status 503.
export default function handler(_req, res) {
  res.setHeader("Content-Type", "application/json");
  res.status(503).json({
    success: false,
    error: {
      code: "API_OFFLINE",
      message:
        "API server is not deployed. Login works after hosting the backend and setting VITE_API_URL at build time (see server/README), or run the API locally.",
    },
  });
}