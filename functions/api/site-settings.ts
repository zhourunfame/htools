import { getSiteSettings, json, type Env } from "../_shared";

const SITE_SETTINGS_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    return json(
      {
        settings: await getSiteSettings(env)
      },
      { headers: SITE_SETTINGS_HEADERS }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load site settings.";
    return json({ error: message }, { status: 400, headers: SITE_SETTINGS_HEADERS });
  }
};
