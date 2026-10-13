'use strict';

const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const { isDbReady } = require('./db/connect');

const app = express();

app.disable('x-powered-by');
// 生产环境在 Nginx / 网关后面，取真实 IP 用于限流
app.set('trust proxy', true);

// CORS：H5 端需要，小程序端不需要；未配置时默认放开（开发方便）
const corsOptions = config.cors.origins.length
  ? {
      origin(origin, callback) {
        if (!origin || config.cors.origins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: true,
    }
  : { origin: true, credentials: true };
app.use(cors(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// 简易访问日志
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const cost = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${cost}ms db=${isDbReady() ? 'up' : 'down'}`
    );
  });
  next();
});

// 根路径信息页，方便部署后确认服务是否活着
const { ok } = require('./utils/response');
app.get('/', (req, res) =>
  ok(res, {
    service: 'shishu-backend',
    env: config.env,
    db: isDbReady() ? 'connected' : 'disconnected',
    apis: [
      'POST   /api/auth/register',
      'POST   /api/auth/login',
      'GET    /api/auth/me',
      'POST   /api/auth/logout',
      'GET    /api/book/:isbn',
      'GET    /api/book?isbn=...',
      'GET    /api/favorites',
      'POST   /api/favorites',
      'DELETE /api/favorites/:isbn',
      'GET    /api/health',
    ],
  })
);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
