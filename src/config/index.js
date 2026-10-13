'use strict';

// 在读 .env 之前先记下平台真正注入的环境变量（dotenv 不会覆盖已存在的变量）。
// 用途：生产环境要求密钥必须来自平台注入，而不是跟着 .env 被打进镜像。
const injectedEnv = {
  JWT_SECRET: process.env.JWT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
  ISBN_WORK_KEY: process.env.ISBN_WORK_KEY,
};

require('dotenv').config();

const toInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',

  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
    dbName: process.env.MONGODB_DB || 'shishu',
    // 不填则由驱动推导：连接串没带库名时默认 admin
    authSource: process.env.MONGODB_AUTH_SOURCE || undefined,
    serverSelectionTimeoutMS: toInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT, 5000),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'shishu-dev-secret-please-change',
    // 文档建议有效期 7 天左右
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  isbn: {
    appKey: process.env.ISBN_WORK_KEY || '',
    endpoint: process.env.ISBN_WORK_ENDPOINT || 'https://data.isbn.work/openApi/getInfoByIsbn',
    timeout: toInt(process.env.ISBN_WORK_TIMEOUT, 8000),
    // 豆瓣兜底：有反爬，必须限频
    doubanEnabled: process.env.DOUBAN_ENABLED !== 'false',
    doubanTimeout: toInt(process.env.DOUBAN_TIMEOUT, 8000),
    doubanInterval: toInt(process.env.DOUBAN_INTERVAL, 800),
    // 当当兜底：作者/出版社/出版时间/定价 比豆瓣更全
    dangdangEnabled: process.env.DANGDANG_ENABLED !== 'false',
    dangdangTimeout: toInt(process.env.DANGDANG_TIMEOUT, 8000),
    dangdangInterval: toInt(process.env.DANGDANG_INTERVAL, 800),
  },

  cache: {
    // 命中缓存直接返回，不再打第三方
    hitTtlDays: toInt(process.env.BOOK_CACHE_HIT_TTL_DAYS, 30),
    // 查不到也缓存一小段时间，避免反复白刷额度
    missTtlHours: toInt(process.env.BOOK_CACHE_MISS_TTL_HOURS, 6),
  },

  cors: {
    // 默认放开；H5 需要 CORS，小程序不需要。生产建议填具体域名
    origins: splitList(process.env.CORS_ORIGINS),
  },

  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    max: toInt(process.env.RATE_LIMIT_MAX, 120),
    authMax: toInt(process.env.RATE_LIMIT_AUTH_MAX, 20),
    bookMax: toInt(process.env.RATE_LIMIT_BOOK_MAX, 60),
  },
};

const DEFAULT_JWT_SECRET = 'shishu-dev-secret-please-change';
const EXAMPLE_JWT_SECRETS = [DEFAULT_JWT_SECRET, 'change-me-to-a-long-random-string'];
const MIN_JWT_SECRET_LENGTH = 32;

const GEN_SECRET_HINT = "node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";

/**
 * 生产环境启动自检。
 * 密钥是否随镜像泄露这件事，交给代码强制把关，而不是靠人记得改 .env。
 */
function assertProductionConfig() {
  if (config.env !== 'production') return;

  const fatal = [];
  const warn = [];

  // 只卡死「真正危险」的配置：密钥可被猜到，等于任何人都能伪造 token 登录任意账号
  if (EXAMPLE_JWT_SECRETS.includes(config.jwt.secret)) {
    fatal.push('JWT_SECRET 仍是示例值，可被猜到');
  }
  if (config.jwt.secret.length < MIN_JWT_SECRET_LENGTH) {
    fatal.push(`JWT_SECRET 长度不足 ${MIN_JWT_SECRET_LENGTH} 位`);
  }

  // 「密钥随镜像泄露」属配置卫生问题，密钥本身够强时不阻断启动，只提醒
  if (!injectedEnv.JWT_SECRET) {
    warn.push('JWT_SECRET 不是通过平台环境变量注入的（当前值随镜像发布，建议改为平台注入）');
  }
  if (!injectedEnv.MONGODB_URI) {
    warn.push('MONGODB_URI 不是通过平台环境变量注入的（含数据库密码，建议改为平台注入）');
  }
  if (!injectedEnv.ISBN_WORK_KEY && config.isbn.appKey) {
    warn.push('ISBN_WORK_KEY 来自 .env，建议改为平台注入');
  }

  warn.forEach((msg) => console.warn(`[config] 安全提醒：${msg}`));

  if (fatal.length) {
    console.error('\n[config] 生产环境配置校验未通过，为安全起见拒绝启动：');
    fatal.forEach((msg) => console.error(`  ✗ ${msg}`));
    console.error('\n请在部署平台的环境变量中注入 JWT_SECRET（Render: Environment 页签）后重新部署。');
    console.error(`生成命令：${GEN_SECRET_HINT}\n`);
    process.exit(1);
  }
}

assertProductionConfig();

module.exports = config;
