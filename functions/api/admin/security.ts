import {
  getAdminSecuritySettings,
  json,
  requireAdmin,
  saveAdminPassword,
  verifyPassword,
  type Env
} from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  return json({
    settings: await getAdminSecuritySettings(env)
  });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    const currentPassword = readPassword(payload.currentPassword, "currentPassword");
    const newPassword = readPassword(payload.newPassword, "newPassword");

    if (!(await verifyPassword(currentPassword, env))) {
      return json({ error: "Current password is incorrect." }, { status: 401 });
    }

    await saveAdminPassword(env, newPassword);

    return json({
      settings: await getAdminSecuritySettings(env)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update admin password.";
    return json({ error: message }, { status: 400 });
  }
};

function readPassword(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value;
}
