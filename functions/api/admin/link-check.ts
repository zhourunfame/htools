import {
  getDatabase,
  getProxySettings,
  json,
  proxifyUrl,
  requireAdmin,
  type Env,
  type ProxySettings
} from "../../_shared";

type LinkKind = "url" | "demoUrl";

type LinkCheckTarget = {
  id: string;
  kind: LinkKind;
};

type StoredTool = {
  id: string;
  name: string;
  url: string;
  demo_url: string | null;
};

const MAX_BATCH_SIZE = 10;
const DEFAULT_TIMEOUT_SECONDS = 6;
const MAX_TIMEOUT_SECONDS = 9;
const MIN_PROXY_TIMEOUT_MS = 1200;
const MAX_PROXY_TIMEOUT_MS = 3000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as {
      links?: unknown;
      timeout?: unknown;
    };
    const targets = readTargets(payload.links);
    const timeoutSeconds = readTimeout(payload.timeout);
    const headers = getSafeForwardedHeaders(request);
    const proxySettings = await getProxySettings(env);

    return json({
      results: await Promise.all(
        targets.map((target) =>
          checkStoredLink(env, target, headers, timeoutSeconds, proxySettings)
        )
      )
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to check links.";
    return json({ error: message }, { status: 400 });
  }
};

function readTargets(value: unknown): LinkCheckTarget[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("links must include at least one target.");
  }

  if (value.length > MAX_BATCH_SIZE) {
    throw new Error(`links can include at most ${MAX_BATCH_SIZE} targets.`);
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Each link target must be an object.");
    }

    const target = item as { id?: unknown; kind?: unknown };
    const id = readString(target.id, "id");
    const kind = readKind(target.kind);

    return { id, kind };
  });
}

function readString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim().slice(0, 256);
}

function readKind(value: unknown): LinkKind {
  if (value === "url" || value === "demoUrl") {
    return value;
  }

  throw new Error("kind must be url or demoUrl.");
}

function readTimeout(value: unknown) {
  const numberValue = Number(value ?? DEFAULT_TIMEOUT_SECONDS);

  if (!Number.isFinite(numberValue)) {
    return DEFAULT_TIMEOUT_SECONDS;
  }

  return Math.min(
    MAX_TIMEOUT_SECONDS,
    Math.max(1, Math.round(numberValue))
  );
}

function getSafeForwardedHeaders(request: Request) {
  const headers = new Headers({
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  });
  const acceptLanguage = request.headers.get("Accept-Language");
  const userAgent = request.headers.get("User-Agent");

  if (acceptLanguage) {
    headers.set("Accept-Language", acceptLanguage);
  }

  if (userAgent) {
    headers.set("User-Agent", userAgent);
  }

  return headers;
}

async function checkStoredLink(
  env: Env,
  target: LinkCheckTarget,
  headers: Headers,
  timeoutSeconds: number,
  proxySettings: ProxySettings
) {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const db = await getDatabase(env);
  const row = await db.prepare(
    "SELECT id, name, url, demo_url FROM tools WHERE id = ?"
  )
    .bind(target.id)
    .first<StoredTool>();

  if (!row) {
    return buildResult(target, "", "", {
      status: 0,
      ok: false,
      startedAt,
      checkedAt,
      error: "Tool not found."
    });
  }

  const url = target.kind === "demoUrl" ? row.demo_url ?? "" : row.url;

  if (!url.trim()) {
    return buildResult(target, row.name, "", {
      status: 0,
      ok: false,
      startedAt,
      checkedAt,
      error: "Link target is empty."
    });
  }

  if (!isCheckableUrl(url)) {
    return buildResult(target, row.name, url, {
      status: 0,
      ok: false,
      startedAt,
      checkedAt,
      error: "URL is not allowed for server-side checking."
    });
  }

  try {
    const totalTimeoutMs = timeoutSeconds * 1000;
    const proxyUrl = proxifyUrl(url, proxySettings);
    const canUseProxy = proxyUrl !== url;
    const proxyBudgetMs =
      canUseProxy && totalTimeoutMs >= 3000
        ? Math.min(
            MAX_PROXY_TIMEOUT_MS,
            Math.max(MIN_PROXY_TIMEOUT_MS, Math.floor(totalTimeoutMs * 0.3))
          )
        : 0;
    const directTimeoutMs = Math.max(1000, totalTimeoutMs - proxyBudgetMs);
    const response = await fetchWithTimeout(url, {
      headers,
      timeoutMs: directTimeoutMs
    });

    if (response.body) {
      await response.body.cancel().catch(() => undefined);
    }

    return buildResult(target, row.name, url, {
      status: response.status,
      ok: response.status < 400,
      startedAt,
      checkedAt,
      finalUrl: response.url
    });
  } catch (error) {
    const remainingMs = Math.max(
      0,
      timeoutSeconds * 1000 - (Date.now() - startedAt)
    );
    const proxyResult = await checkLinkViaProxy(
      url,
      headers,
      remainingMs,
      proxySettings
    );

    if (proxyResult.ok) {
      return buildResult(target, row.name, url, {
        status: 200,
        ok: true,
        startedAt,
        checkedAt,
        finalUrl: url
      });
    }

    return buildResult(target, row.name, url, {
      status: 0,
      ok: false,
      startedAt,
      checkedAt,
      error: proxyResult.error ?? toErrorMessage(error)
    });
  }
}

async function checkLinkViaProxy(
  url: string,
  headers: Headers,
  timeoutMs: number,
  proxySettings: ProxySettings
) {
  const proxyUrl = proxifyUrl(url, proxySettings);

  if (timeoutMs < MIN_PROXY_TIMEOUT_MS || proxyUrl === url) {
    return { ok: false, error: "Network request failed." };
  }

  try {
    const response = await fetchWithTimeout(proxyUrl, {
      headers,
      timeoutMs: Math.min(MAX_PROXY_TIMEOUT_MS, timeoutMs)
    });

    if (response.body) {
      await response.body.cancel().catch(() => undefined);
    }

    if (response.status < 400) {
      return { ok: true };
    }
  } catch {
    return { ok: false, error: "Network request failed." };
  }

  return { ok: false, error: "Network request failed." };
}

function fetchWithTimeout(
  url: string,
  {
    headers,
    timeoutMs
  }: {
    headers: Headers;
    timeoutMs: number;
  }
) {
  return fetch(url, {
    method: "GET",
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
}

function buildResult(
  target: LinkCheckTarget,
  name: string,
  url: string,
  result: {
    status: number;
    ok: boolean;
    startedAt: number;
    checkedAt: string;
    finalUrl?: string;
    error?: string;
  }
) {
  return {
    ...target,
    name,
    url,
    status: result.status,
    ok: result.ok,
    duration: Date.now() - result.startedAt,
    checkedAt: result.checkedAt,
    finalUrl: result.finalUrl,
    error: result.error
  };
}

function isCheckableUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      return false;
    }

    return !isBlockedIp(hostname);
  } catch {
    return false;
  }
}

function isBlockedIp(hostname: string) {
  return hostname.includes(":") ? isBlockedIpv6(hostname) : isBlockedIpv4(hostname);
}

function isBlockedIpv4(hostname: string) {
  const parts = hostname.split(".");

  if (parts.length !== 4) {
    return false;
  }

  const bytes = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    const value = Number(part);
    return value >= 0 && value <= 255 ? value : Number.NaN;
  });

  if (bytes.some(Number.isNaN)) {
    return false;
  }

  const [a, b] = bytes as [number, number, number, number];

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string) {
  return (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:")
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 300);
  }

  return "Network request failed.";
}
