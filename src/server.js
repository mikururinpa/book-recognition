'use strict';

const http = require('http');
const app = require('./app');
const config = require('./config');
const { connectWithRetry, disconnectDB } = require('./db/connect');

const server = http.createServer(app);

async function bootstrap() {
  // 先监听端口，保证 /api/health 在数据库抖动时也能响应
  await new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      console.log(`[server] listening on http://${config.host}:${config.port} (${config.env})`);
      resolve();
    });
  });

  try {
    await connectWithRetry(5);
  } catch (err) {
    console.error('[mongo] 数据库连接失败，接口将返回 500:', err.message);
  }
}

async function shutdown(signal) {
  console.log(`[server] received ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await disconnectDB();
    } catch (err) {
      console.error('[server] 关闭数据库连接失败:', err.message);
    }
    process.exit(0);
  });
  // 兜底强制退出
  setTimeout(() => process.exit(0), 10000).unref();
}

['SIGINT', 'SIGTERM'].forEach((signal) => process.on(signal, () => shutdown(signal)));

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
});

bootstrap();

module.exports = server;
