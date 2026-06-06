/**
 * Shared API route wrapper — dedups the try/catch + error-JSON boilerplate
 * that every legacy `app/api/.../route.ts` handler repeated.
 *
 * Usage:
 *   export const GET = route({ error: 'Failed to fetch friends' }, async (request) => {
 *     // ... return NextResponse.json({ success: true, ... });
 *   });
 *
 * Behavior contract (matches the legacy hand-rolled blocks exactly):
 * - Uncaught errors log via `logger.error` and return
 *   `{ success: false, error: <opts.error> }` with status 500.
 * - Throwing `new ApiError(status, message)` anywhere in the handler returns
 *   `{ success: false, error: message }` with that status — handy for
 *   validation early-exits without deep `return` nesting.
 * - Anything the handler returns passes through untouched.
 *
 * Routes whose catch blocks do more than log-and-500 (per-error branching,
 * cleanup, non-standard shapes) should keep their own try/catch inside the
 * handler — the wrapper then only acts as a last-resort net.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RouteOptions {
  /** Message returned (and logged) when the handler throws unexpectedly. */
  error: string;
}

type RouteContext = { params: Promise<Record<string, string>> };

type Handler = (
  request: NextRequest,
  context: RouteContext,
) => Promise<NextResponse> | NextResponse;

export function route(opts: RouteOptions, handler: Handler): Handler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      logger.error(opts.error, {
        route: request.nextUrl.pathname,
        method: request.method,
        error: String(error),
      });
      return NextResponse.json(
        { success: false, error: opts.error },
        { status: 500 },
      );
    }
  };
}
