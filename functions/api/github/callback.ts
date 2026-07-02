import {
  buildGitHubSessionCookie,
  getDatabase,
  getGitHubSettings,
  isGitHubConfigured,
  type Env
} from "../../_shared";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const fallbackUrl = new URL("/submit?auth=failed", request.url);

  if (!code || !state) {
    return Response.redirect(fallbackUrl.toString(), 302);
  }

  const settings = await getGitHubSettings(env);
  if (!isGitHubConfigured(settings)) {
    return Response.redirect(fallbackUrl.toString(), 302);
  }

  const db = await getDatabase(env);
  const stateRow = await db.prepare(
    "SELECT return_to FROM github_oauth_states WHERE state = ? AND expires_at > ?"
  )
    .bind(state, new Date().toISOString())
    .first<{ return_to: string }>();

  if (!stateRow) {
    return Response.redirect(fallbackUrl.toString(), 302);
  }

  await db.prepare("DELETE FROM github_oauth_states WHERE state = ?")
    .bind(state)
    .run();

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code,
      redirect_uri: new URL("/api/github/callback", request.url).toString()
    })
  });
  const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

  if (!tokenData.access_token) {
    return Response.redirect(fallbackUrl.toString(), 302);
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "htools"
    }
  });

  if (!userResponse.ok) {
    return Response.redirect(fallbackUrl.toString(), 302);
  }

  const user = (await userResponse.json()) as GitHubUserResponse;
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await db.batch([
    db.prepare("DELETE FROM github_sessions WHERE expires_at <= ?").bind(
      new Date().toISOString()
    ),
    db.prepare(
      `INSERT INTO github_sessions
        (token, github_id, github_login, github_name, avatar_url, html_url, access_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sessionToken,
      user.id,
      user.login,
      user.name,
      user.avatar_url,
      user.html_url,
      tokenData.access_token,
      expiresAt
    )
  ]);

  const destination = new URL(stateRow.return_to, request.url);
  destination.searchParams.set("auth", "success");

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      "Set-Cookie": buildGitHubSessionCookie(request, sessionToken)
    }
  });
};
