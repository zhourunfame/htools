import { getProxySettings, json, type Env } from "../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    return json({
      settings: await getProxySettings(env)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load proxy settings.";
    return json({ error: message }, { status: 400 });
  }
};
