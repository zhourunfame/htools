import {
  getDatabase,
  json,
  requireAdmin,
  syncContentSource,
  type Env
} from "../../../../_shared";

export const onRequestPost: PagesFunction<Env> = async ({
  request,
  env,
  params
}) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const db = await getDatabase(env);
    const id = String(params.id ?? "");
    const result = await syncContentSource(db, id);

    return json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to sync content source.";
    return json({ error: message }, { status: 400 });
  }
};
