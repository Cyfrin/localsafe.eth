#!/usr/bin/env node
/**
 * Local CORS proxy for the Octav API.
 *
 * LocalSafe ships as a static HTML export (`output: "export"`), so there is
 * no Next.js server to proxy from. `api.octav.fi` doesn't send CORS headers,
 * so the browser can't call it directly. This script bridges the gap during
 * development: it listens on :8010 and forwards `/v1/portfolio*` requests to
 * `https://api.octav.fi`, attaching permissive CORS headers on the way back.
 *
 * The client supplies its own Authorization header — this script never sees
 * or stores the user's Octav API key, it just shuttles requests upstream.
 *
 * Run: node dev/octav-proxy.mjs   (port override: PORT=8011 node …)
 */

import http from "node:http";

const PORT = Number(process.env.PORT) || 8010;
const UPSTREAM = "https://api.octav.fi";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept",
  "access-control-max-age": "86400",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { ...CORS_HEADERS, "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Parse URL so we can match pathname exactly — `startsWith("/v1/portfolio")`
  // would have accepted `/v1/portfoliofoo` or any other prefix collision. The
  // proxy is whitelisted to the single GET /v1/portfolio endpoint and
  // forwards only its query string.
  const parsed = new URL(req.url ?? "/", "http://localhost");
  if (parsed.pathname !== "/v1/portfolio") {
    res.writeHead(404, { ...CORS_HEADERS, "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const upstreamUrl = `${UPSTREAM}${parsed.pathname}${parsed.search}`;
  const auth = req.headers["authorization"];
  if (!auth) {
    res.writeHead(401, { ...CORS_HEADERS, "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Missing Authorization header" }));
    return;
  }

  try {
    // 30s ceiling so a hung upstream can't hold the client socket open
    // indefinitely (Node's fetch has no default timeout).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    const upstream = await fetch(upstreamUrl, {
      headers: { Authorization: auth, Accept: "application/json" },
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));
    const body = await upstream.text();
    res.writeHead(upstream.status, {
      ...CORS_HEADERS,
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    });
    res.end(body);
  } catch (err) {
    // Log the detail server-side; return a generic error to the client so
    // internal hostnames / DNS errors don't leak into the browser console.
    console.error("[octav-proxy] upstream error:", err);
    res.writeHead(502, { ...CORS_HEADERS, "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream fetch failed" }));
  }
});

server.listen(PORT, () => {
  console.log(`Octav CORS proxy → ${UPSTREAM} on http://localhost:${PORT}`);
});
