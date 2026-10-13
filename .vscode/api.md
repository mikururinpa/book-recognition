# 识书 · 后端接口文档

> 面向后端开发。前端是 uni-app（Vue3 + Vite），目前用浏览器本地存储把流程跑通了，
> 这份文档描述**正式后端需要提供的接口**。
>
> 前端对应的实现文件：
> - 账号：`uni-preset-vue-vite/src/utils/account.js`
> - 图书信息：`uni-preset-vue-vite/src/utils/bookApi.js`
> - 收藏：`uni-preset-vue-vite/src/pages/result/result.vue` 与 `pages/collect/collect.vue`
> - 接口配置：`uni-preset-vue-vite/src/utils/bookApi.js` 顶部的 `BOOK_API_CONFIG`

---这是一个基于nodejs的后端项目，我的数据库连接方式是mongodb://root:<密码>@test-db-mongodb.ns-6ib005q8.svc:27017（真实连接串不入库，通过环境变量 MONGODB_URI 注入）
本文档详细描述了这个SRPIP科研项目作品——实现图书二维码、条形码识别。支持拍照与图片上传，校正畸变图像，解析ISBN，获取图书资料，的所有后端接口以及信息
## 一、为什么必须要后端

不是"想加就加"，是三条硬约束：

1. **微信小程序强制 HTTPS + 服务器域名白名单。**
   小程序只能请求在微信公众平台备案过的域名。第三方接口（`data.isbn.work`）加不进白名单，
   **小程序端根本发不出请求**。必须由自己的域名中转。

2. **第三方接口拒绝浏览器直连。**
   实测 `data.isbn.work` 收到带 `Origin` 头的请求直接返回 **403**，且响应里没有
   `Access-Control-Allow-Origin`。也就是说 **curl / Postman 能通，浏览器必挂** —— 必须服务端转发。

3. **appKey 不能放在客户端。**
   目前前端源码里明文写着 appKey，浏览器 F12 就能看到，小程序包也能反编译出来。
   **key 必须挪到服务端。**

另外账号和收藏要跨设备同步，也依赖服务端。

---

## 二、通用约定

### 2.1 地址

| 环境 | Base URL |
|---|---|
| 本地开发 | 由 Vite 代理转发，前端请求相对路径 |
| 测试 / 生产 | 待定，例：`https://api.your-domain.com` |

> 上线前需要在微信公众平台把该域名加入 **request 合法域名**，且必须是 **HTTPS**。

### 2.2 认证

登录后返回 `token`，后续请求统一放在请求头：

```
Authorization: Bearer <token>
```

前端会把 token 存在本地存储的 `shishu_token` 键下。

### 2.3 请求与响应格式

- 请求体：`application/json`，UTF-8
- 响应体：`application/json`，UTF-8

**统一响应结构：**

```json
{
  "ok": true,
  "data": { },
  "message": ""
}
```

失败时：

```json
{
  "ok": false,
  "message": "账号或密码错误"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | boolean | 是否成功，前端以此判断 |
| `data` | object / array / null | 成功时的数据 |
| `message` | string | 失败原因，**要能直接展示给用户看** |

### 2.4 HTTP 状态码约定

| 状态码 | 含义 | 前端处理 |
|---|---|---|
| 200 | 成功（失败也走 200 + `ok:false`） | 按 `ok` 判断 |
| 401 | token 失效 / 未登录 | 清除本地 token，跳回登录页 |
| 500 | 服务端异常 | 提示"服务暂时不可用" |

> 业务失败（密码错误、书查不到）**建议用 200 + `ok:false`**，避免和网络异常混在一起。

---

## 三、接口清单

| # | 方法 | 路径 | 说明 | 需要登录 |
|---|---|---|---|---|
| 1 | POST | `/api/auth/register` | 注册 | 否 |
| 2 | POST | `/api/auth/login` | 登录 | 否 |
| 3 | GET | `/api/auth/me` | 取当前用户信息 | 是 |
| 4 | POST | `/api/auth/logout` | 退出登录 | 是 |
| 5 | GET | `/api/book/:isbn` | 按 ISBN 查图书信息 | 否 |
| 6 | GET | `/api/favorites` | 收藏列表 | 是 |
| 7 | POST | `/api/favorites` | 添加收藏 | 是 |
| 8 | DELETE | `/api/favorites/:isbn` | 取消收藏 | 是 |

---

### 1. 注册

```
POST /api/auth/register
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `account` | string | 是 | 账号，手机号 / 邮箱 / 用户名，前端限制 3~32 字符 |
| `password` | string | 是 | 密码，前端限制 6~16 位 |

```json
{
  "account": "18061555226",
  "password": "abc123456"
}
```

**成功响应**

```json
{
  "ok": true,
  "data": {
    "account": "18061555226",
    "createdAt": 1760000000000
  }
}
```

**失败**

- 账号已存在 → `{ "ok": false, "message": "该账号已注册，直接去登录" }`
- 参数不合法 → `{ "ok": false, "message": "密码至少 6 位" }`

**注意**

- 密码**必须加盐哈希存储**（bcrypt / argon2）。前端现在存在 localStorage 里是明文，那只是原型。
- 前端注册成功后是跳回登录页、不自动登录。如果你们希望注册即登录，返回 `token` 即可，前端可改。

---

### 2. 登录

```
POST /api/auth/login
```

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `account` | string | 是 | 账号 |
| `password` | string | 是 | 密码 |

```json
{
  "account": "18061555226",
  "password": "abc123456"
}
```

**成功响应**

```json
{
  "ok": true,
  "data": {
    "token": "eyJhbGciOi...",
    "account": "18061555226",
    "expiresAt": 1760086400000
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `token` | string | 前端存到本地 `shishu_token`，之后放 `Authorization` 头 |
| `account` | string | 用于主页显示"你好，xxx" |
| `expiresAt` | number | 毫秒时间戳，token 过期时间（可选，前端暂未使用） |

**失败**

```json
{ "ok": false, "message": "账号或密码错误" }
```

**注意**

- 前端现在有个内置演示账号 `demo / 123456`，接后端后应删掉这段逻辑。
- token 建议用 JWT，有效期 7 天左右。

---

### 3. 获取当前用户信息

```
GET /api/auth/me
Authorization: Bearer <token>
```

**成功响应**

```json
{
  "ok": true,
  "data": {
    "account": "18061555226",
    "createdAt": 1760000000000
  }
}
```

**失败**

- token 无效 / 过期 → HTTP **401**，前端会清 token 并跳回登录页。

**用途**：前端启动或进入主页时校验登录态是否还有效。

---

### 4. 退出登录

```
POST /api/auth/logout
Authorization: Bearer <token>
```

**成功响应**

```json
{ "ok": true }
```

**注意**

- 如果用 JWT 且不做服务端黑名单，这个接口可以只返回成功，前端自己清本地 token。
- 如果需要"立即失效"，得在服务端维护 token 黑名单。

---

### 5. 按 ISBN 查图书信息 ⭐ 核心接口

```
GET /api/book/:isbn
```

也可以写成 `GET /api/book?isbn=9787576358629`，两种前端都能配合。

**路径参数 / 查询参数**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `isbn` | string | 是 | 13 位数字，**不带连字符**，如 `9787576358629` |

**成功响应**

```json
{
  "ok": true,
  "data": {
    "isbn": "9787576358629",
    "title": "2027张宇考研数学基础30讲・高等数学分册",
    "author": "张宇 主编 编",
    "publisher": "北京理工大学出版社",
    "pubDate": "2025-09-01",
    "price": "139.90 元",
    "cover": "https://data-isbn.oss-cn-hangzhou.aliyuncs.com/xxx.jpg",
    "summary": "《考研数学基础30讲.高等数学分册:函套三册》由张宇主..."
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `title` | string | 是 | 书名。**空的话前端会认为查询失败** |
| `author` | string | 否 | 作者，没有前端显示 `—` |
| `publisher` | string | 否 | 出版社 |
| `pubDate` | string | 否 | 出版日期，`YYYY-MM-DD` 或 `YYYY-MM` |
| `price` | string | 否 | 定价，**建议直接返回带单位的字符串**（如 `"139.90 元"`） |
| `cover` | string | 否 | 封面图 URL，必须是**可直接访问的公网地址** |
| `summary` | string | 否 | 简介 |

**失败**

```json
{ "ok": false, "message": "接口里没有这本书的记录" }
```

**实现要点（重要）**

1. **数据源优先级建议**
   - 第一优先：**isbn.work**（`https://data.isbn.work/openApi/getInfoByIsbn`）
     中文图书数据全。appKey 放在服务端，**不要下发给客户端**。
     参考参数：`?appKey=<KEY>&isbn=<ISBN>`
   - 第二优先：**豆瓣兜底**。`https://book.douban.com/isbn/{isbn}/` 会 302 跳到书籍详情页，
     能解析出书名/作者/出版社/封面。实测可用，但豆瓣有反爬，**要控制频率并加 User-Agent**。
   - 备选：Open Library（免费无 key，但**中文书基本查不到**）、Google Books（国内访问不通）。

2. **必须做缓存。** 同一个 ISBN 反复查很浪费额度（isbn.work 免费次数有限），
   建议按 ISBN 缓存到数据库或 Redis，命中就不再打第三方。

3. **字段名映射（第三方接口和本文档不一致，务必转换）**

   isbn.work 的原始字段是这样，直接透传会导致前端显示空白：

   | isbn.work 原始字段 | 本文档字段 | 备注 |
   |---|---|---|
   | `bookName` | `title` | |
   | `author` | `author` | |
   | `press` | `publisher` | **不是 `publisher`** |
   | `pressDate` | `pubDate` | **不是 `publishDate`** |
   | `price` | `price` | **单位是「分」**，`13990` 要转成 `"139.90 元"` |
   | `pictures` | `cover` | **是 JSON 字符串数组**，形如 `"[\"https://...\"]"`，要 `JSON.parse` 后取第一个 |
   | `bookDesc` | `summary` | **不是 `summary` / `description`** |

---

### 6. 收藏列表

```
GET /api/favorites
Authorization: Bearer <token>
```

**成功响应**

```json
{
  "ok": true,
  "data": [
    {
      "isbn": "9787576358629",
      "title": "2027张宇考研数学基础30讲・高等数学分册",
      "author": "张宇 主编 编",
      "publisher": "北京理工大学出版社",
      "cover": "https://data-isbn.oss-cn-hangzhou.aliyuncs.com/xxx.jpg",
      "savedAt": 1760000000000
    }
  ]
}
```

**排序**：按 `savedAt` **倒序**（最近收藏的在最前），前端直接按返回顺序渲染。

**说明**：这个结构就是前端 `shishu_favorites` 里存的结构，字段保持一致即可直接复用渲染逻辑。

---

### 7. 添加收藏

```
POST /api/favorites
Authorization: Bearer <token>
```

**请求体**

```json
{
  "isbn": "9787576358629",
  "title": "2027张宇考研数学基础30讲・高等数学分册",
  "author": "张宇 主编 编",
  "publisher": "北京理工大学出版社",
  "cover": "https://data-isbn.oss-cn-hangzhou.aliyuncs.com/xxx.jpg"
}
```

**成功响应**

```json
{ "ok": true }
```

**注意**

- 同一个用户重复收藏同一 ISBN，**建议做幂等**（已存在就直接返回成功），不要报错。
- 服务端应记录 `savedAt`（毫秒时间戳）。
- 前端在图书信息还没查到时也可能点收藏，那时 `title` 会是 `ISBN xxxxx`，
  `author` / `publisher` / `cover` 为空字符串 —— **后端要允许这些字段为空**。

---

### 8. 取消收藏

```
DELETE /api/favorites/:isbn
Authorization: Bearer <token>
```

**成功响应**

```json
{ "ok": true }
```

**注意**：删除不存在的记录也应返回成功（幂等）。

---

## 四、前端当前实现对照表

接后端的时候，前端这几处需要替换成真实请求：

| 功能 | 前端现在的做法 | 替换为 |
|---|---|---|
| 注册 | 写进 localStorage 的 `shishu_users` | `POST /api/auth/register` |
| 登录 | 读 localStorage 比对，然后写假的 `shishu_token='demo-token'` | `POST /api/auth/login` |
| 登录态校验 | 无（只看本地有没有 token） | `GET /api/auth/me` |
| 退出 | 删本地 `shishu_token` | `POST /api/auth/logout` + 删本地 |
| 图书查询 | 前端直连 isbn.work（靠 Vite 代理绕跨域） | `GET /api/book/:isbn` |
| 收藏列表 | 读 localStorage 的 `shishu_favorites` | `GET /api/favorites` |
| 添加收藏 | 写 localStorage | `POST /api/favorites` |
| 取消收藏 | 改 localStorage | `DELETE /api/favorites/:isbn` |

**配置位置**：`uni-preset-vue-vite/src/utils/bookApi.js` 顶部的

```js
export const BOOK_API_CONFIG = {
  isbnWorkKey: '...',        // 接后端后删掉，key 移到服务端
  isbnWorkEndpoint: '/isbn-api',
  backendUrl: '',            // ← 填后端地址后，所有查询都优先走这里
}
```

`backendUrl` 填上之后，前端就会优先请求后端，`isbnWorkKey` 和 Vite 代理都可以撤掉。

---

## 五、上线检查清单

- [ ] 域名备案 + HTTPS 证书
- [ ] 微信公众平台配置 **request 合法域名**（否则小程序发不出请求）
- [ ] appKey 只在服务端保存，**确认前端包里搜不到**
- [ ] 密码加盐哈希，不用明文
- [ ] 图书查询做缓存，避免打爆第三方额度
- [ ] 接口加频率限制（防刷）
- [ ] CORS 按需配置：H5 端需要，小程序端不需要

---

## 六、备注：两个可以省略的接口

如果后端人力紧张，这两个可以先不做：

- `POST /api/auth/logout` —— 用 JWT 的话前端自己清 token 就够了
- `GET /api/auth/me` —— 前端可以暂时只判断本地有没有 token

但 **第 5 个（图书查询）和第 1、2 个（注册登录）是必须的**，其他都能推后。
