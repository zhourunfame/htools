import {
  getGitHubSession,
  getGitHubSettings,
  isGitHubConfigured,
  json,
  type Env
} from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const settings = await getGitHubSettings(env);
  const session = await getGitHubSession(request, env);

  return json({
    configured: isGitHubConfigured(settings),
    authenticated: Boolean(session),
    user: session
      ? {
          login: session.github_login,
          name: session.github_name,
          avatar_url: session.avatar_url,
          html_url: session.html_url
        }
      : null
  });
};
