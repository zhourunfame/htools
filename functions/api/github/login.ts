import {
  getDatabase,
  getGitHubSettings,
  isGitHubConfigured,
  json,
  type Env
} from "../../_shared";

const STATE_TTL_MS = 1000 * 60 * 10;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const settings = await getGitHubSettings(env);

  if (!isGitHubConfigured(settings)) {
    return json({ error: "GitHub submissions are not configured." }, { status: 400 });
  }

  const requestUrl = new URL(request.url);
  const returnTo = normalizeReturnTo(requestUrl.searchParams.get("returnTo"));
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString();
  const db = await getDatabase(env);

  await db.batch([
    db.prepare("DELETE FROM github_oauth_states WHERE expires_at <= ?").bind(
      new Date().toISOString()
    ),
    db.prepare(
      "INSERT INTO github_oauth_states (state, return_to, expires_at) VALUES (?, ?, ?)"
    ).bind(state, returnTo, expiresAt)
  ]);

  const callbackUrl = new URL("/api/github/callback", request.url);
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", settings.clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", "read:user public_repo");
  authorizeUrl.searchParams.set("state", state);

  return Response.redirect(authorizeUrl.toString(), 302);
};

function normalizeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/submit";
  }

  return value;
}
