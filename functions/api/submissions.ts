import {
  getGitHubSession,
  getGitHubSettings,
  isGitHubConfigured,
  json,
  type Env
} from "../_shared";

type SubmissionPayload = {
  name?: unknown;
  description?: unknown;
  url?: unknown;
  category?: unknown;
  locale?: unknown;
  tags?: unknown;
};

type SubmissionLocale = "zh" | "en";

type GitHubIssueResponse = {
  html_url?: string;
  number?: number;
  message?: string;
  errors?: Array<{
    field?: string;
    message?: string;
    resource?: string;
  }>;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const settings = await getGitHubSettings(env);

  if (!isGitHubConfigured(settings)) {
    return json({ error: "GitHub submissions are not configured." }, { status: 400 });
  }

  const session = await getGitHubSession(request, env);
  if (!session) {
    return json({ error: "Please sign in with GitHub first." }, { status: 401 });
  }

  try {
    const payload = validateSubmissionPayload((await request.json()) as SubmissionPayload);
    const title = buildIssueTitle(payload);
    const body = buildIssueBody(payload, session.github_login);
    const firstAttempt = await createGitHubIssue({
      accessToken: session.access_token,
      body,
      labels: settings.labels,
      owner: settings.owner,
      repo: settings.repo,
      title
    });

    const result =
      shouldRetryWithoutLabels(firstAttempt.issue, settings.labels)
        ? await createGitHubIssue({
            accessToken: session.access_token,
            body,
            labels: [],
            owner: settings.owner,
            repo: settings.repo,
            title
          })
        : firstAttempt;

    if (!result.response.ok || !result.issue.html_url || !result.issue.number) {
      return json(
        {
          error:
            result.issue.message ??
            "GitHub rejected this submission. Check repository issue permissions."
        },
        { status: result.response.status }
      );
    }

    return json({
      submission: {
        issueUrl: result.issue.html_url,
        issueNumber: result.issue.number
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to submit this tool.";
    return json({ error: message }, { status: 400 });
  }
};

async function createGitHubIssue({
  accessToken,
  body,
  labels,
  owner,
  repo,
  title
}: {
  accessToken: string;
  body: string;
  labels: string[];
  owner: string;
  repo: string;
  title: string;
}) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "htools",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        title,
        body,
        ...(labels.length ? { labels } : {})
      })
    }
  );
  const issue = (await response.json()) as GitHubIssueResponse;

  return { issue, response };
}

function shouldRetryWithoutLabels(issue: GitHubIssueResponse, labels: string[]) {
  if (!labels.length) {
    return false;
  }

  const messages = [
    issue.message,
    ...(issue.errors ?? []).flatMap((error) => [
      error.field,
      error.message,
      error.resource
    ])
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return messages.some(
    (message) =>
      message.includes("label") ||
      message.includes("labels") ||
      message.includes("标签")
  );
}

function validateSubmissionPayload(payload: SubmissionPayload) {
  const name = readRequiredString(payload.name, "name");
  const description = readRequiredString(payload.description, "description");
  const url = normalizeSubmissionUrl(readRequiredString(payload.url, "url"));
  const category = readRequiredString(payload.category, "category");
  const locale = normalizeSubmissionLocale(payload.locale);
  const tags = Array.isArray(payload.tags)
    ? payload.tags.flatMap((tag) =>
        typeof tag === "string" ? splitSubmissionTags(tag) : []
      )
        .slice(0, 8)
    : [];

  return {
    name,
    description,
    url,
    category,
    locale,
    tags
  };
}

function normalizeSubmissionLocale(value: unknown): SubmissionLocale {
  return value === "en" ? "en" : "zh";
}

function splitSubmissionTags(value: string) {
  return value
    .split(/[\s,，、。;；|｜/／\\]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readRequiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}

function normalizeSubmissionUrl(value: string) {
  const normalized = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    return new URL(normalized).toString();
  } catch {
    throw new Error("url must be a valid URL.");
  }
}

function buildIssueTitle(payload: ReturnType<typeof validateSubmissionPayload>) {
  return payload.locale === "en"
    ? `Tool submission: ${payload.name}`
    : `工具提交：${payload.name}`;
}

function buildIssueBody(
  payload: ReturnType<typeof validateSubmissionPayload>,
  githubLogin: string
) {
  const categoryLabel = getSubmissionCategoryLabel(payload.category, payload.locale);
  const tags = payload.tags.length
    ? payload.tags.join(", ")
    : payload.locale === "en"
      ? "None"
      : "无";

  if (payload.locale === "en") {
    return [
      "## Tool info",
      "",
      `- Name: ${payload.name}`,
      `- URL: ${payload.url}`,
      `- Category: ${categoryLabel}`,
      `- Tags: ${tags}`,
      "",
      "## Description",
      "",
      payload.description,
      "",
      "## Submitter",
      "",
      `Submitted by @${githubLogin} via HTools.`
    ].join("\n");
  }

  return [
    "## 工具信息",
    "",
    `- 名称：${payload.name}`,
    `- 地址：${payload.url}`,
    `- 分类：${categoryLabel}`,
    `- 标签：${tags}`,
    "",
    "## 简介",
    "",
    payload.description,
    "",
    "## 提交者",
    "",
    `由 @${githubLogin} 通过 HTools 提交。`
  ].join("\n");
}

function getSubmissionCategoryLabel(category: string, locale: SubmissionLocale) {
  if (locale === "en") {
    return category;
  }

  return zhCategoryLabels[category] ?? category;
}

const zhCategoryLabels: Record<string, string> = {
  "Web Framework": "Web 框架",
  "Browser Extension": "浏览器插件",
  Database: "数据库",
  "UI Framework": "UI 框架",
  Prototype: "原型设计",
  Authentication: "身份认证",
  Payment: "支付服务",
  "Ideas Creativity": "创意灵感",
  "SEO Opt": "SEO 优化",
  Ads: "广告联盟",
  I18N: "国际化",
  "AI Tools": "AI 工具",
  "Image Hosting": "图床",
  Email: "邮箱",
  Analytics: "网站分析",
  Tunnel: "隧道",
  Acceleration: "加速",
  "Speed Test": "测速",
  Monitoring: "监控",
  "Developer Tools": "开发者工具",
  "Customer Support": "客户服务",
  "Docs Tools": "文档工具",
  "Deploy Service": "部署服务",
  "Domain Service": "域名服务",
  "Project Management": "项目管理",
  "Product Launch": "产品发布",
  "Other Tools": "其他工具"
};
