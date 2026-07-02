import type { Env } from "./_shared";

const FILE_EXTENSION_PATTERN = /\/[^/]+\.[^/]+$/;

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    url.pathname.startsWith("/api/") ||
    FILE_EXTENSION_PATTERN.test(url.pathname)
  ) {
    return context.next();
  }

  const response = await context.next();

  if (response.status !== 404) {
    return response;
  }

  const indexUrl = new URL("/index.html", request.url);
  return env.ASSETS.fetch(new Request(indexUrl, request));
};
