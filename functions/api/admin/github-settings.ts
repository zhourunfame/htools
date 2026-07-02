import {
  getGitHubSettings,
  json,
  requireAdmin,
  saveGitHubSettings,
  toGitHubSettingsResponse,
  type Env,
  type GitHubSettingsInput
} from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  const settings = await getGitHubSettings(env);
  return json({ settings: toGitHubSettingsResponse(settings, request) });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const current = await getGitHubSettings(env);
    const payload = (await request.json()) as GitHubSettingsInput;
    const settings = await saveGitHubSettings(env, current, payload);

    return json({ settings: toGitHubSettingsResponse(settings, request) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save GitHub settings.";
    return json({ error: message }, { status: 400 });
  }
};
