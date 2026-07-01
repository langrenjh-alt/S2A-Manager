# S2A Manager

S2A Manager 是一个面向 Sub2API 站点的运维管理面板，用来集中管理多个 Sub2API 后台连接、分组倍率、账号调度、倍率采集、上游可用性检测、公告和任务日志。

它不是 Sub2API 本体的替代品，而是站长日常维护 Sub2API 的辅助工具。项目重点解决长期运营中容易反复出现的问题：倍率频繁调整、上游账号不稳定、采集源倍率变化、分组或账号重建后绑定失效、自动化任务不可见、日志和历史残留难排查等。

- 项目仓库：[langrenjh-alt/S2A-Manager](https://github.com/langrenjh-alt/S2A-Manager)
- 参考中转站：[https://z30.top](https://z30.top)
- 使用说明：[使用说明.md](./使用说明.md)
- Ubuntu 部署：[部署指南.md](./部署指南.md)
- 许可证：[MIT](./LICENSE)

## 功能概览

### 多站点连接

- 维护多个 Sub2API 管理连接。
- 支持连接测试、启停、手动同步和自动同步模式。
- 每个连接可独立管理分组、账号、采集源、公告、日志和监控规则。

### 分组倍率管理

- 查看、创建、编辑和删除目标 Sub2API 分组。
- 为分组绑定一个或多个采集源分组。
- 支持首个源倍率、平均值、最低值、最高值和自定义公式计算目标倍率。
- 支持倍率偏移，例如在源倍率基础上统一加减固定值。
- 支持手动应用规则，也支持 worker 在采集完成或自动同步时应用规则。

### 账号调度管理

- 新增、编辑、删除账号，并维护平台、类型、状态、调度开关、并发、优先级、负载权重、过期时间等字段。
- 支持账号模型测试、刷新凭证、清除错误、启停调度。
- 支持为账号绑定采集源分组，并用同一套倍率规则计算账号倍率。
- 支持账号余额查询、单账号余额阈值和余额 Webhook 预警。
- 支持账号优先级规则：可按账号倍率排序，也可结合 Sub2API 流式使用记录的平均首字时间与账号倍率计算调度优先级。

### 倍率采集

- 在面板内维护 Sub2API 或 New API 类型的采集源。
- 支持自动登录或手动 Token 认证。
- 支持配置采集间隔、充值倍率和 New-Api-User。
- 定时采集源站分组倍率、模型价格和倍率变更记录。
- 展示原始倍率、写入倍率和换算后的生效倍率。
- 采集完成后可自动触发已启用的分组倍率、账号倍率和账号优先级规则。

### 上游检测

- 为账号配置定时可用性检测规则。
- 支持指定检测模型、检测间隔、失败阈值和暂停时长。
- 连续失败达到阈值后可自动暂停账号调度。
- 暂停期间仍会继续探活；检测恢复后可自动恢复调度。
- 账号暂停期间可临时排除对应采集源分组参与目标分组倍率计算，避免故障账号影响自动倍率。
- 提供 Uptime 结果、最近检测结果和自动暂停记录。

### 公告和站点设置

- 维护 Sub2API 常用站点设置。
- 配置倍率变化公告规则。
- 只有当目标分组倍率实际变化时，才会触发自动公告发布。

### 服务状态、日志和清理

- 查看 Web、数据库、worker 心跳、采集源、自动同步连接、上游检测规则和最近任务日志状态。
- 任务日志写入本地文件，支持按连接、级别、状态、动作、目标、时间和关键词筛选。
- 支持日志保留时间、最低记录级别、清理过期日志和清空日志。
- 提供“清理无效数据”维护操作，用于处理目标分组或账号删除、源站分组删除或改名、采集源删除、连接不可用等造成的本地残留。

## 技术栈

- Next.js 14 / React 18
- tRPC 11 / TanStack Query 5
- Prisma 5 / PostgreSQL
- Tailwind CSS / Radix UI / lucide-react
- 后台 worker：`tsx src/worker/monitor.ts`

## 环境要求

- Node.js 20 或更高版本
- npm
- PostgreSQL
- 可访问目标 Sub2API 管理接口的网络环境

项目当前使用 PostgreSQL。旧版 SQLite 数据不会通过 `prisma migrate deploy` 自动迁移到 PostgreSQL，已有生产数据升级前请先备份并单独准备迁移方案。

## 快速开始

管理台功能和操作流程请看 [使用说明.md](./使用说明.md)。

```bash
npm ci
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

开发服务默认监听：

```text
http://127.0.0.1:3000
```

首次访问会进入初始化页面，创建第一个管理员账号。

后台自动任务需要单独启动：

```bash
npm run worker
```

Web 服务和 worker 是两个进程。只启动 Web 可以使用管理页面，但自动采集、自动同步、上游检测、余额 Webhook 预警、日志清理和 worker 心跳都依赖 worker。

## 环境变量

`.env.example` 提供最小配置：

```env
DATABASE_URL="postgresql://s2amanager:password@127.0.0.1:5432/s2amanager?schema=public"
APP_SECRET="change-me-to-a-24-plus-char-secret!"
ENCRYPTION_KEY="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
```

生产环境必须替换：

- `DATABASE_URL`：PostgreSQL 连接字符串。
- `APP_SECRET`：登录会话签名密钥，至少 24 位随机字符串。
- `ENCRYPTION_KEY`：32 字节 base64 字符串，可用 `openssl rand -base64 32` 生成。已有加密数据后不要更换，否则已保存的 API Key 和源站凭证无法解密。

可选环境变量：

- `S2A_LOG_DIR`：本地任务日志目录，默认是项目目录下的 `logs/`。
- `S2A_WORKER_INTERVAL_SECONDS`：数据库未配置时的 worker 默认运行间隔，默认 600 秒。
- `S2A_ACCOUNT_BALANCE_ALERT_INTERVAL_SECONDS`：数据库未配置时的余额预警默认检查间隔，默认 300 秒。
- `S2A_UPSTREAM_MONITOR_TIMEOUT_SECONDS`：数据库未配置时的上游检测超时，默认 45 秒。
- `S2A_UPSTREAM_MONITOR_CONCURRENCY`：数据库未配置时的上游检测并发，默认 3。
- `S2A_WORKER_ONCE=1`：只执行一轮 worker 后退出，适合排查问题。

worker 运行间隔、上游检测超时和检测并发也可以在管理台右上角“应用设置”里调整。数据库中的设置优先于环境变量。

## 常用命令

```bash
npm run dev
npm run build
npm run start
npm run worker
npm run lint
npm run prisma:generate
npm run prisma:push
npx prisma validate
npx prisma migrate deploy
```

说明：

- `npm run dev`：启动开发 Web 服务。
- `npm run build`：生成 Prisma Client 并构建 Next.js。
- `npm run start`：启动生产 Web 服务。
- `npm run worker`：启动后台 worker。
- `npx prisma migrate deploy`：在 PostgreSQL 上应用已提交的数据库迁移。

## 生产部署

Ubuntu 部署请优先阅读：[部署指南.md](./部署指南.md)

基本流程：

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start
```

生产环境还需要同时托管 worker：

```bash
npm run worker
```

推荐使用 systemd、pm2 或其他进程管理工具分别托管 Web 和 worker。不要把 `.env`、生产日志、构建产物、依赖目录、数据库备份或压缩包提交到仓库。

## 使用建议

- 先添加 Sub2API 连接，再按需配置采集源、分组规则、账号规则和上游检测。
- 倍率规则只有开启“使用倍率规则”后才会被手动或自动应用。
- 采集源的“充值倍率”会参与生效倍率换算，配置前应确认源站余额单位和倍率含义。
- 上游检测规则设置为 1 分钟时，建议把 worker 运行间隔也设置为 1 分钟。
- 单轮 worker 任务耗时超过运行间隔时，下一轮会在当前轮结束后继续执行，不会并发重叠执行。
- 删除采集源、目标分组或账号后，如果历史绑定仍有残留，可在“服务状态”页面执行“清理无效数据”。
- 中文公告按 UTF-8 JSON 发送；如果远端仍出现乱码，请检查反向代理和目标 Sub2API 站点的编码处理。

## 更新记录

README 不再维护手写提交流水账，避免文档频繁过期。完整更新记录请查看：

- [GitHub Commits](https://github.com/langrenjh-alt/S2A-Manager/commits/main/)
- [GitHub Releases](https://github.com/langrenjh-alt/S2A-Manager/releases)
