/**
 * api/index.ts
 *
 * Vercel serverless function entry point.
 *
 * Vercel's @vercel/node runtime only picks up functions inside the `api/`
 * directory. This file is a thin wrapper that re-exports the Express app
 * defined in /server.ts. The app already guards `app.listen()` behind
 * `!process.env.VERCEL`, so importing it here is side-effect safe.
 *
 * Request flow:
 *   client  -> Vercel edge
 *           -> rewrite /api/:path* -> /api/index
 *           -> this function (Express app receives original req.url)
 *           -> matched Express route handler
 */
import app from '../server.js';

export default app;
