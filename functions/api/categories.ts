import {
  getAdminCategorySettings,
  getDatabase,
  json,
  type Env
} from "../_shared";

type CategoryRow = {
  category: string;
  total: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const db = await getDatabase(env);
  const [result, settings] = await Promise.all([
    db.prepare(
      "SELECT category, COUNT(*) as total FROM tools GROUP BY category ORDER BY category ASC"
    ).all<CategoryRow>(),
    getAdminCategorySettings(env)
  ]);

  return json({ categories: result.results, settings });
};
