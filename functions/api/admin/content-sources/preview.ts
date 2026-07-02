import {
  fetchFeedPreview,
  json,
  requireAdmin,
  validateContentSourcePayload,
  type Env
} from "../../../_shared";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = validateContentSourcePayload(
      (await request.json()) as object,
      { requireCategory: false }
    );
    const feed = await fetchFeedPreview(payload.url);

    return json({
      feed: {
        title: feed.title,
        description: feed.description,
        siteUrl: feed.siteUrl,
        feedUrl: feed.feedUrl,
        items: feed.items.slice(0, 12)
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to preview content source.";
    return json({ error: message }, { status: 400 });
  }
};
