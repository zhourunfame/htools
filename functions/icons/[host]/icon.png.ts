const ICON_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;
const ICON_ERROR_CACHE_TTL_SECONDS = 60 * 5;
const ICON_UPSTREAM_TIMEOUT_MS = 2500;
const ICON_MAX_BUFFER_BYTES = 256 * 1024;
const BITWARDEN_DEFAULT_GLOBE_ICON_BYTES = 500;
const BITWARDEN_DEFAULT_GLOBE_ICON_SHA256 =
  "aaa64871332ad5b7d28fe8874efb19c2d9cc2f1e6de75d52b080b438225a0783";

const SAFE_ICON_MEDIA_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon"
]);

type IconSource = {
  url: string;
  headers?: HeadersInit;
  rejectImage?: {
    byteLength: number;
    sha256: string;
  };
};

export const onRequest: PagesFunction = async (context) => {
  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "GET, HEAD"
      }
    });
  }

  const rawHost = Array.isArray(context.params.host)
    ? context.params.host[0]
    : context.params.host;
  const response = await handleWebsiteIcon(String(rawHost ?? ""));

  if (context.request.method === "HEAD") {
    return new Response(null, {
      status: response.status,
      headers: response.headers
    });
  }

  return response;
};

function normalizeIconHost(rawHost: string): string | null {
  let decoded: string;

  try {
    decoded = decodeURIComponent(String(rawHost || "").trim())
      .toLowerCase()
      .replace(/\.+$/, "");
  } catch {
    return null;
  }

  if (!decoded || decoded.includes("/") || decoded.includes("\\")) {
    return null;
  }

  try {
    const parsed = new URL(`https://${decoded}`);
    return parsed.hostname === decoded ? decoded : null;
  } catch {
    return null;
  }
}

function normalizeMediaType(contentType: string | null | undefined) {
  return String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function isSafeWebsiteIconContentType(contentType: string | null | undefined) {
  return SAFE_ICON_MEDIA_TYPES.has(normalizeMediaType(contentType));
}

async function fetchIconSource(source: IconSource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ICON_UPSTREAM_TIMEOUT_MS);

  try {
    return await fetch(source.url, {
      headers: source.headers,
      redirect: "follow",
      signal: controller.signal,
      cf: {
        cacheEverything: true,
        cacheTtl: ICON_CACHE_TTL_SECONDS
      }
    } as RequestInit & {
      cf: {
        cacheEverything: boolean;
        cacheTtl: number;
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getPositiveContentLength(headers: Headers) {
  const raw = headers.get("Content-Length");
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function readIconBytes(response: Response, maxBytes: number) {
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, ICON_UPSTREAM_TIMEOUT_MS);

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }

      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  if (timedOut || totalBytes === 0) {
    return null;
  }

  const output = new ArrayBuffer(totalBytes);
  const bytes = new Uint8Array(output);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function iconResponse(body: BodyInit, contentType: string | null) {
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": `public, max-age=${ICON_CACHE_TTL_SECONDS}, immutable`,
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox",
      "Content-Type": contentType || "image/png"
    }
  });
}

function missingIconResponse() {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": `public, max-age=${ICON_ERROR_CACHE_TTL_SECONDS}`
    }
  });
}

async function handleWebsiteIcon(rawHost: string) {
  const normalizedHost = normalizeIconHost(rawHost);

  if (!normalizedHost) {
    return missingIconResponse();
  }

  const encodedHost = encodeURIComponent(normalizedHost);
  const requestHeaders = { "User-Agent": "HTools/1.0" };
  const upstreamSources: IconSource[] = [
    {
      headers: requestHeaders,
      url: `https://favicon.im/zh/${encodedHost}?larger=true&throw-error-on-404=true`
    },
    {
      headers: requestHeaders,
      rejectImage: {
        byteLength: BITWARDEN_DEFAULT_GLOBE_ICON_BYTES,
        sha256: BITWARDEN_DEFAULT_GLOBE_ICON_SHA256
      },
      url: `https://icons.bitwarden.net/${encodedHost}/icon.png`
    }
  ];

  for (const source of upstreamSources) {
    try {
      const response = await fetchIconSource(source);

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("Content-Type");

      if (!isSafeWebsiteIconContentType(contentType)) {
        continue;
      }

      const contentLength = getPositiveContentLength(response.headers);

      if (contentLength !== null && contentLength > ICON_MAX_BUFFER_BYTES) {
        continue;
      }

      const bytes = await readIconBytes(response, ICON_MAX_BUFFER_BYTES);

      if (!bytes) {
        continue;
      }

      if (
        source.rejectImage &&
        bytes.byteLength === source.rejectImage.byteLength &&
        (await sha256Hex(bytes)) === source.rejectImage.sha256
      ) {
        continue;
      }

      return iconResponse(bytes, contentType);
    } catch {
      continue;
    }
  }

  return missingIconResponse();
}
