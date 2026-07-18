# HTools

HTools 是一款部署在 Cloudflare Pages Functions + D1 上的开源工具导航站。它适合用来搭建自己的工具库、文章页和内容流聚合后台，支持工具管理、文章发布、RSS 内容源同步、GitHub 提交 Issue、GitHub 仓库信息补全、分类管理、站点设置、备份恢复和公开订阅源。

[Telegram 频道](https://t.me/lsmkc) | [Telegram 群组](https://t.me/lsmoo)

[English](README_EN.md) | 简体中文 | [部署教程](https://blog.zrf.me/p/HTools/)

## 演示截图

![HTools 前台工具库](public/demo/frontend-tools.png)

![HTools 后台工具库](public/demo/admin-tools.png)

## 功能

- 前台工具库：首页、工具分类、文章、提交工具、关于页面。
- 后台管理：工具、文章、内容流、分类、系统设置集中管理。
- 内容流：支持 RSS 订阅，同步后可临时浏览或转为站内文章。
- Markdown：文章正文和关于页面支持 Markdown。
- GitHub 能力：公开用户可通过 GitHub 登录提交工具，后台添加工具时可自动读取仓库名称、简介、封面、标签、Star、Fork、协议等信息。
- 分类管理：工具、文章、内容流分类可预建、筛选、删除，也可批量处理分类内容。
- 数据能力：完整备份 / 恢复、默认工具订阅源、公开站点源 `/api/htools.json`。
- SEO 输出：`/sitemap.xml`、`/rss.xml`、`/rss.json`。
- 双语界面：简体中文和英文。

## 部署

1. Fork 或导入本仓库到你的 GitHub。
2. 在 Cloudflare Pages 新建项目，并连接你的仓库。
3. Pages 构建设置填写：

```txt
构建命令：npm run build
构建输出目录：dist
```

4. 在 Cloudflare D1 新建数据库，例如 `htools`。
5. 回到 Pages 项目设置，给 Functions 添加 D1 绑定：

```txt
变量名称：DB
D1 数据库：选择你刚创建的数据库
```

6. 按下方环境变量表在 Pages 部署环境中添加需要的变量，并将标记为 Secret 的内容使用加密变量保存。

7. 重新部署 Pages 项目。
8. 打开 `/admin` 登录后台。

应用会在首次访问 API 时自动初始化 D1 表结构，并在 `app_settings` 中记录数据库结构版本；后续新的 Worker 实例只读取一次版本号，只有版本落后时才自动执行建表、索引或字段兼容升级。D1 默认是空的，项目不会在部署时自动写入默认工具数据；你可以在后台导入默认订阅源，也可以手动添加工具。整个过程仍然只需要在 Pages 中绑定变量名为 `DB` 的 D1，不需要手动执行 Migration 命令。

## 环境变量

项目实际读取的环境变量如下：

| 变量 | 必需 | 建议类型 | 用途 |
| --- | --- | --- | --- |
| `ADMIN_PASSWORD` | 是 | Secret | 后台初始登录密码，同时用于管理员登录会话签名；部署后不要随意删除或更换。 |
| `GITHUB_TOKEN` | 否 | Secret | 后台添加或编辑工具时读取公开 GitHub 仓库信息，并提高 GitHub API 请求限额。 |
| `TURNSTILE_SITE_KEY` | 否，需与私密密钥同时配置 | 普通变量 | Cloudflare Turnstile 站点密钥，供管理员登录页和前端工具提交页加载验证组件。 |
| `TURNSTILE_SECRET_KEY` | 否，需与站点密钥同时配置 | Secret | Cloudflare Turnstile 私密密钥，供服务端验证人机验证结果。 |

后台密码当前只要求非空，支持中文、英文、数字和常见符号，项目没有强制最短或最长长度；建议使用至少 12 位且独立的强密码。

`GITHUB_TOKEN` 用于后台添加或编辑工具时读取公开 GitHub 仓库信息，认证请求可提高 GitHub API 限额，并配合缓存和 ETag 减少重复请求。建议使用稳定账号创建的只读 Token，不要授予仓库写入、删除或管理权限；该变量与公开提交功能使用的 GitHub OAuth 用户令牌无关。未配置时仍可读取公开仓库，但会使用较低的未认证 API 限额。

如需使用 Cloudflare Turnstile，请先创建 Turnstile 站点并添加当前部署域名，再按表格完整配置站点密钥和私密密钥。重新部署后前往后台“服务设置”开启 Cloudflare Turnstile；配置不完整时后台无法开启，关闭时前端不会加载验证组件。生产环境和预览环境如使用不同域名，需要分别配置对应环境变量和允许的主机名。

## 本地开发

```bash
npm install
npm run dev
```

如需手动初始化或排查 D1：

```bash
npm run db:init:local
npm run db:init:remote
```

## 后台设置

- `/admin`：后台入口。
- 系统设置：站点名称、站点图标、关于页面 Markdown、页脚、GitHub 提交、代理访问、备份恢复、管理员密码。
- GitHub 提交设置：配置 OAuth App 和目标仓库后，用户通过 `/submit` 提交的工具会创建为 GitHub Issue。
- GitHub 仓库信息：后台添加或编辑工具时，填写 GitHub 仓库地址后可读取仓库元数据。

GitHub OAuth App 的 Authorization callback URL：

```txt
https://你的域名/api/github/callback
```

## 数据源

- 默认工具源文件：[public/htools.json](public/htools.json)
- 默认工具源访问地址：[https://raw.githubusercontent.com/shaoyouvip/htools/refs/heads/main/public/htools.json](https://raw.githubusercontent.com/shaoyouvip/htools/refs/heads/main/public/htools.json)
- 当前站点公开源：`/api/htools.json`

默认工具源只是在线订阅源，不会自动写入 D1。管理员可以在后台导入它，也可以导入其他站点公开的 `/api/htools.json`。默认地址指向 HTools 主仓库，方便未同步更新项目代码的站点导入最新工具数据。

公开工具、分类、文章列表和 `/api/htools.json` 使用 30 秒 Cloudflare 边缘短缓存，公开站点设置和代理设置使用 15 秒短缓存，并支持 ETag 条件请求。每次后台成功修改公开数据都会更新 D1 全局缓存版本，因此不同域名和边缘节点的后续请求不会继续命中旧版本；并发中的旧请求即使稍后写入，也只会写到已经失效的旧版本缓存键。空列表、禁用状态和错误响应不会写入缓存，客户端仍使用 `no-cache` 重新验证，关闭公开订阅源后不会继续直接使用浏览器里的旧响应。

## SEO 和订阅

- `/sitemap.xml`：公开页面和已发布文章的站点地图。
- `/rss.xml`：已发布文章的 RSS。
- `/rss.json`：已发布文章的 JSON Feed。

## 版本

当前版本：`HTools v1.0.12`
