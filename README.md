# 识书 · 后端服务（shishu-backend）

SRPIP 科研项目「图书二维码 / 条形码识别」的后端，按 `.vscode/api.md` 接口文档实现。

技术栈：Node.js 18 + Express 4 + MongoDB(Mongoose) + JWT + bcryptjs。

## 快速开始

```bash
npm install
cp .env.example .env   # 按需修改（仓库已附一份可用配置）
bash entrypoint.sh      # 先装依赖再启动，默认 0.0.0.0:3000
```

`entrypoint.sh` 就是两条命令 —— 安装依赖 + 启动应用：

```bash
npm install --no-audit --no-fund
npm start
```

> 运行模式取自 `NODE_ENV`（读 `.env` 或平台注入的环境变量），不再由启动参数决定。
> 敏感配置（`MONGODB_URI` / `JWT_SECRET` / `ISBN_WORK_KEY`）建议改到平台的应用管理里配置环境变量，
> 而不是跟着 `.env` 打进镜像。监听地址为 `0.0.0.0`，端口读 `PORT`（默认 3000）。

自测（需服务已启动）：

```bash
npm run smoke -- http://127.0.0.1:3000
```

冒烟脚本会创建 `smoke_<时间戳>` 测试账号，跑完可自行清理。

## 目录结构

```
src/
├── server.js                 # 启动入口：先监听端口，再连数据库（带重试）
├── app.js                    # Express 装配：CORS / JSON / 日志 / 路由 / 错误处理
├── config/index.js           # 全部环境变量集中在这里
├── db/connect.js             # Mongo 连接与健康状态
├── models/                   # User / Favorite / BookCache / RevokedToken
├── middleware/
│   ├── auth.js               # Bearer Token 鉴权（校验 JWT + 黑名单）
│   ├── rateLimit.js          # 内存限流，防刷
│   └── error.js              # 统一错误与 404
├── routes/                   # auth / book / favorites 路由
├── services/                 # auth / token / book / favorite 业务逻辑
├── providers/
│   ├── isbnWork.js           # 首选数据源（字段映射 + 单位换算）
│   └── douban.js             # 豆瓣兜底（限频 + User-Agent）
└── utils/                    # 统一响应 / ISBN 归一化 / 带超时 fetch
```

## 接口一览

> 给前端的完整对接文档（含全部请求/返回示例与 uni-app 封装代码）：[`前端对接文档.md`](./前端对接文档.md)
> 本次全部改动记录（含问题修复与待办）：[`改动说明.md`](./改动说明.md)

统一响应结构 `{ ok, data, message }`；业务失败走 `200 + ok:false`，鉴权失败走 `401`，服务异常走 `500`。

| # | 方法 | 路径 | 说明 | 需要登录 |
|---|---|---|---|---|
| 1 | POST | `/api/auth/register` | 注册（账号 3~32 字符，密码 6~16 位） | 否 |
| 2 | POST | `/api/auth/login` | 登录，返回 JWT（默认 7 天） | 否 |
| 3 | GET | `/api/auth/me` | 取当前用户信息 | 是 |
| 4 | POST | `/api/auth/logout` | 退出登录（jti 入黑名单，立即失效） | 是 |
| 5 | GET | `/api/book/:isbn` | 按 ISBN 查图书（支持 `?isbn=` 形式） | 否 |
| 6 | GET | `/api/favorites` | 收藏列表，按 `savedAt` 倒序 | 是 |
| 7 | POST | `/api/favorites` | 添加收藏（同用户同 ISBN 幂等） | 是 |
| 8 | DELETE | `/api/favorites/:isbn` | 取消收藏（不存在也返回成功） | 是 |
| - | GET | `/api/health` | 探活，返回数据库连接状态 | 否 |

鉴权头：`Authorization: Bearer <token>`

## 图书查询实现要点

1. **数据源优先级**：`isbn.work` → 豆瓣 → 当当，**三个源互相补字段**（先到先得，后面的源只填空缺），关键字段齐了就提前结束不再请求后面的源。
   - `isbn.work`：数据最全，需在 `.env` 填 `ISBN_WORK_KEY`（**只放服务端，绝不下发客户端**）；未配置 key 时自动跳过。
   - 豆瓣：有反爬，且**很多条目本身就没有作者/出版社/定价数据**（用豆瓣官方 JSON 接口验证过，字段是空数组）。`DOUBAN_INTERVAL` 控制调用间隔。
   - 当当：搜索页里含书名 / 作者 / 出版社 / 出版时间 / 定价 / 封面，是**作者和出版社字段的主要来源**。页面为 GB2312 编码需按 GBK 解码，`DANGDANG_INTERVAL` 控制调用间隔。
   - 三个源都没有数据时才返回 `ok:false`。所以**不配 `ISBN_WORK_KEY` 也能拿到较完整的字段**，但配了会更准更全。
2. **缓存**：按 ISBN 落库到 `book_cache` 集合，命中直接返回，不再打第三方。
   命中缓存 30 天，未命中（miss）缓存 6 小时，避免反复白刷额度；到期由 TTL 索引自动清理。
3. **字段映射**（第三方字段与文档字段不一致，已在 `providers/isbnWork.js` 转换）：

   | isbn.work | 文档字段 | 处理 |
   |---|---|---|
   | `bookName` | `title` | |
   | `press` | `publisher` | |
   | `pressDate` | `pubDate` | 归一为 `YYYY-MM-DD` |
   | `price` | `price` | **单位是分**，`13990` → `"139.90 元"` |
   | `pictures` | `cover` | JSON 字符串数组，`JSON.parse` 后取第一个 |
   | `bookDesc` | `summary` | |

4. **ISBN 归一化**：自动去掉空格与连字符，ISBN-10 转 ISBN-13，非法输入返回 `ok:false`。

## 安全相关

- 密码使用 bcrypt 加盐哈希（`passwordHash`），不存明文；登录失败提示统一为「账号或密码错误」，避免账号枚举。
- JWT 密钥通过 `JWT_SECRET` 注入；退出登录把 `jti` 写入 `revoked_tokens` 集合（TTL 自动清理），token 立即失效。
- 接口限流：全局 120 次/分钟，`/api/auth/*` 20 次/分钟，`/api/book/*` 60 次/分钟（可用 `RATE_LIMIT_*` 调整）。
- 图书查询接口不暴露 appKey，第三方请求全部由服务端转发。

### 配置分级与生产启动自检

敏感配置**不要跟着 `.env` 打进镜像**，改到平台「应用管理 → 环境变量」注入（平台注入的值优先级高于 `.env`，已实测）：

| 变量 | 级别 | 泄露后果 |
|---|---|---|
| `JWT_SECRET` | **必须平台注入** | 可伪造任意用户 token，直接登录任何账号 |
| `MONGODB_URI` | 建议平台注入 | 数据库可被读写 / 删除 |
| `ISBN_WORK_KEY` | 建议平台注入 | 白刷第三方额度 |
| `PORT` / 超时 / 缓存 TTL / 限流 / `CORS_ORIGINS` | 留在 `.env` 即可 | 无 |

生成生产密钥：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

生产环境（`NODE_ENV=production`）启动时会自检：`JWT_SECRET` 仍是示例值或长度不足 32 位时，**直接拒绝启动并打印修复指引**，避免弱密钥上线；密钥够强但未走平台注入、以及 `MONGODB_URI` 未平台注入，都只打警告、不阻断启动。

> 这段自检只在 `NODE_ENV=production` 时生效。默认（`NODE_ENV=development`）不检查，所以本地开发不受影响。

## 前端对接

前端 `uni-preset-vue-vite/src/utils/bookApi.js` 顶部把 `backendUrl` 填成后端地址即可，
所有查询优先走后端；随后可以删掉 `isbnWorkKey` 与 Vite 代理。账号、收藏分别替换为
`/api/auth/*`、`/api/favorites` 请求，token 存本地 `shishu_token` 键。

## 上线检查清单

- [ ] 域名备案 + HTTPS 证书
- [ ] 微信公众平台配置 request 合法域名
- [x] appKey 只在服务端保存
- [x] 密码加盐哈希
- [x] 图书查询落库缓存
- [x] 接口限流
- [x] CORS 按需配置（`CORS_ORIGINS` 留空放开，生产填 H5 域名）
