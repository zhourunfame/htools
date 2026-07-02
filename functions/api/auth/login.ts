import { createToken, json, verifyPassword, type Env } from "../../_shared";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const payload = (await request.json()) as { password?: unknown };

    if (
      typeof payload.password !== "string" ||
      !(await verifyPassword(payload.password, env))
    ) {
      return json({ error: "Invalid password." }, { status: 401 });
    }

    return json({ token: await createToken(env) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to login.";
    return json({ error: message }, { status: 400 });
  }
};
