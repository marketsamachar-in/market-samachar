/**
 * Auth middleware for Paper Trading routes.
 *
 * Validates the Supabase Bearer JWT from the Authorization header and
 * attaches the resolved user to `req.user`.  Returns 401 without a token
 * and 503 if Supabase is not configured.
 */

import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

// Lazy singleton — created on first use so the module can be imported even
// before env vars are loaded (e.g. during TypeScript compilation checks).
let _client: ReturnType<typeof createClient> | null = null;

function getSupabase(): ReturnType<typeof createClient> | null {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

// ─── Extended request type ────────────────────────────────────────────────────

export interface AuthedUser {
  id:    string;
  email?: string;
  name?:  string;
}

// Extend Express Request so downstream handlers have typed `req.user`
declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function requireAuth(
  req:  Request,
  res:  Response,
  next: NextFunction,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ ok: false, error: "Auth service not configured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, error: "Authorization header required" });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ ok: false, error: "Invalid or expired token" });
    return;
  }

  const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
  req.user = {
    id:    data.user.id,
    email: data.user.email,
    name:  meta.full_name || meta.name || data.user.email || "Anonymous",
  };

  next();
}

// Optional auth — if a valid Bearer token is present, attaches req.user.
// Unlike requireAuth, does NOT reject the request when the token is missing
// or invalid. Use for public routes that personalise responses when signed in.
export async function optionalAuth(
  req:  Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }
  const supabase = getSupabase();
  if (!supabase) return next();

  try {
    const token = authHeader.slice(7);
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      const meta = (data.user.user_metadata ?? {}) as Record<string, string>;
      req.user = {
        id:    data.user.id,
        email: data.user.email,
        name:  meta.full_name || meta.name || data.user.email || "Anonymous",
      };
    }
  } catch {
    // Silently ignore — route remains public
  }
  next();
}
