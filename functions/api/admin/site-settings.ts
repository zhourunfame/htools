import { json, requireAdmin, saveSiteSettings, type Env } from "../../_shared";

const SITE_SETTINGS_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as {
      name?: unknown;
      subtitle?: unknown;
      iconUrl?: unknown;
      aboutContent?: unknown;
      footer?: unknown;
    };

    return json(
      {
        settings: await saveSiteSettings(env, payload)
      },
      { headers: SITE_SETTINGS_HEADERS }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save site settings.";
    return json({ error: message }, { status: 400, headers: SITE_SETTINGS_HEADERS });
  }
};
