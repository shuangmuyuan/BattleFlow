# BattleFlow

BattleFlow 是一个面向 AI Native 产品规划的 Skill 编排和工作流平台。它把可复用的方法论沉淀为 Skill，再通过导入、审核、发布、版本管理和工作流编排，把产品规划过程中的调研、分析、需求拆解和产出追踪串起来。

## 当前能力

- Skill 仓库：支持官方、团队、个人三类 Skill。
- Skill 导入：只支持 ZIP 包上传。
- 团队审核：个人 Skill 可以提交团队审核，审核通过后发布到团队仓库。
- 版本管理：支持查看历史版本、下载 Skill Markdown、打开原始内容和回滚非官方 Skill。
- 工作流基础页面：为后续把 Skill 编排为产品规划任务流预留入口。
- 知识库和 Demo 页面：为规划资料沉淀、后续生成演示产物预留入口。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Direct Postgres through `pg`
- pnpm

## 快速开始

安装依赖：

```bash
pnpm install
```

启动开发服务：

```bash
pnpm dev
```

默认端口来自 `DEPLOY_RUN_PORT` 或 `PORT`，未设置时使用 `5000`。

生产构建：

```bash
pnpm build
```

启动生产服务：

```bash
BATTLEFLOW_PROJECT_ENV=PROD DEPLOY_RUN_PORT=5100 pnpm start
```

## 环境变量

基础运行：

```bash
BATTLEFLOW_PROJECT_ENV=DEV
DEPLOY_RUN_PORT=5000
HOSTNAME=localhost
```

Postgres:

```bash
BATTLEFLOW_DATABASE_URL=
BATTLEFLOW_DATABASE_SSL=false
```

Skill registry：

```bash
SKILL_REGISTRY_DIR=./data/skill-registry
```

`SKILL_REGISTRY_DIR` 默认指向项目内的 `data/skill-registry`。该目录是运行时数据，已在 `.gitignore` 中排除。

## 目录结构

```text
src/
  app/
    api/skills/          Skill 仓库 API
    dashboard/skills/    Skill 仓库页面
    dashboard/workflows/ 工作流页面
  lib/
    skill-registry.ts    文件型 Skill registry 实现
  storage/database/      Direct Postgres client boundary

skills/
  official/              官方 Skill seed

scripts/
  dev.sh                 开发服务启动脚本
  build.sh               生产构建脚本
  start.sh               生产服务启动脚本
```

## Skill 包结构

一个 Skill 至少应包含：

```text
skill-name/
  skill.md
  meta.json
  CHANGELOG.md
```

`meta.json` 示例：

```json
{
  "id": "example-skill",
  "name": "Example Skill",
  "description": "Example Skill description.",
  "version": "1.0.0",
  "author": "BattleFlow Team",
  "tags": ["example"],
  "tools": ["web_search", "knowledge_query"]
}
```

## 校验命令

```bash
pnpm ts-check
pnpm lint:build
pnpm build
```

## 部署说明

当前测试环境目录：

```text
/root/data/BattleFlow
```

启动示例：

```bash
cd /root/data/BattleFlow
BATTLEFLOW_PROJECT_ENV=PROD HOSTNAME=0.0.0.0 DEPLOY_RUN_PORT=5100 pnpm start
```

本地可通过 SSH 隧道访问：

```bash
ssh -L 5100:127.0.0.1:5100 boxhub-r
```

然后打开：

```text
http://127.0.0.1:5100
```
