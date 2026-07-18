# HTools

HTools is an open-source tool directory built on Cloudflare Pages Functions and D1. It can be used as a personal or public tool library with articles, RSS content flows, GitHub issue submissions, GitHub repository metadata, category management, site settings, backup and restore, and public subscription feeds.

[Telegram Channel](https://t.me/lsmkc) | [Telegram Group](https://t.me/lsmoo)

English | [简体中文](README.md) | [Deployment Guide](https://blog.zrf.me/p/HTools/)

## Screenshots

![HTools public tool library](public/demo/frontend-tools.png)

![HTools admin tool library](public/demo/admin-tools.png)

## Features

- Public site: home, tool categories, articles, tool submission, and about page.
- Admin dashboard: tools, articles, content flows, categories, and system settings.
- Content flows: sync RSS feeds, preview items, and convert entries into site articles.
- Markdown: article content and the about page support Markdown.
- GitHub integration: users can sign in with GitHub and submit tools as repository issues; admins can fetch GitHub repository metadata when adding tools.
- Categories: pre-create, filter, delete, and batch-handle tool, article, and content-flow categories.
- Data tools: full backup / restore, default tool subscription source, and public site source at `/api/htools.json`.
- SEO feeds: `/sitemap.xml`, `/rss.xml`, and `/rss.json`.
- UI languages: Simplified Chinese and English.

## Deployment

1. Fork or import this repository into your GitHub account.
2. Create a Cloudflare Pages project and connect it to your repository.
3. Use these Pages build settings:

```txt
Build command: npm run build
Build output directory: dist
```

4. Create a Cloudflare D1 database, for example `htools`.
5. Go back to the Pages project settings and add a D1 binding for Functions:

```txt
Variable name: DB
D1 database: select the database you just created
```

6. Add the required variables to the Pages deployment environment using the environment-variable table below, and store every value marked as Secret as an encrypted variable.

7. Redeploy the Pages project.
8. Open `/admin` and sign in.

The app initializes the D1 schema automatically on first API access and stores a schema version in `app_settings`. New Worker instances then read the version once and only run table, index, or column compatibility upgrades when the stored version is behind. The database starts empty; HTools does not write default tools during deployment. Import the default subscription source from the admin dashboard or add tools manually. You still only need to bind the D1 database as `DB` in Pages; no manual migration command is required.

## Environment Variables

The application reads the following environment variables:

| Variable | Required | Recommended type | Purpose |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | Yes | Secret | Initial administrator password and signing secret for administrator login sessions; do not remove or change it casually after deployment. |
| `GITHUB_TOKEN` | No | Secret | Reads public GitHub repository metadata while adding or editing tools and raises the GitHub API request limit. |
| `TURNSTILE_SITE_KEY` | No; configure together with the secret key | Plain variable | Cloudflare Turnstile Site Key used to load the widget on administrator login and public tool submission pages. |
| `TURNSTILE_SECRET_KEY` | No; configure together with the site key | Secret | Cloudflare Turnstile Secret Key used by the server to verify challenge results. |

The admin password only has to be non-empty. Letters, numbers, symbols, and Unicode characters are accepted, and the project does not enforce a minimum or maximum length; use a unique password of at least 12 characters.

`GITHUB_TOKEN` is used when the admin dashboard reads public GitHub repository metadata while adding or editing tools. Authenticated requests raise the GitHub API limit, while caching and ETag revalidation reduce repeated requests. Use a read-only token from a stable account and do not grant repository write, delete, or administration permissions. This variable is separate from the GitHub OAuth user token used by public submissions. Public metadata still works without it, but uses the lower unauthenticated API limit.

To use Cloudflare Turnstile, create a Turnstile site and add the deployed domain, then configure both the Site Key and Secret Key from the table. After redeploying, enable Cloudflare Turnstile under Admin → Service Settings. The dashboard cannot enable it when the configuration is incomplete, and the public widget is not loaded while the service is disabled. If production and preview use different domains, configure the appropriate variables and allowed hostnames for each environment.

## Local Development

```bash
npm install
npm run dev
```

For manual D1 initialization or troubleshooting:

```bash
npm run db:init:local
npm run db:init:remote
```

## Admin Settings

- `/admin`: admin dashboard entry.
- System Settings: site name, site icon, about page Markdown, footer, GitHub submissions, proxy fallback, backup / restore, and admin password.
- GitHub submissions: configure a GitHub OAuth App and target repository so public submissions at `/submit` create GitHub issues.
- GitHub repository info: when adding or editing a tool, enter a GitHub repository URL to fetch metadata.

GitHub OAuth App Authorization callback URL:

```txt
https://your-domain.com/api/github/callback
```

## Data Sources

- Default source file: [public/htools.json](public/htools.json)
- Default source URL: [https://raw.githubusercontent.com/shaoyouvip/htools/refs/heads/main/public/htools.json](https://raw.githubusercontent.com/shaoyouvip/htools/refs/heads/main/public/htools.json)
- Current site public source: `/api/htools.json`

The default tool source is only an online subscription source. It is not written to D1 automatically. Administrators can import it from the dashboard or import another site's `/api/htools.json`. The default URL points to the HTools main repository so sites that have not updated their code can still import the latest tool data.

Public tool, category, article-list, and `/api/htools.json` responses use a 30-second Cloudflare edge cache. Public site and proxy settings use a 15-second cache, with ETag conditional requests. Every successful admin write updates a global D1 cache version, so later requests from different domains and edge locations no longer match an old version; an older concurrent request can only populate an obsolete cache key. Empty lists, disabled sources, and error responses are never cached, and clients still revalidate with `no-cache`, so disabling the public source does not leave a directly reusable browser response.

## SEO And Feeds

- `/sitemap.xml`: sitemap for public pages and published articles.
- `/rss.xml`: RSS feed for published articles.
- `/rss.json`: JSON Feed for published articles.

## Version

Current version: `HTools v1.0.12`
