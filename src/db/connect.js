'use strict';

const mongoose = require('mongoose');
const config = require('../config');

mongoose.set('strictQuery', true);

function buildOptions() {
  const options = {
    dbName: config.mongo.dbName,
    serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMS,
    // 连接未就绪时立即报错，而不是挂起请求直到超时
    bufferCommands: false,
  };
  if (config.mongo.authSource) options.authSource = config.mongo.authSource;
  return options;
}

async function connectDB() {
  mongoose.connection.on('connected', () => {
    console.log(`[mongo] connected -> ${config.mongo.dbName}`);
  });
  mongoose.connection.on('error', (err) => {
    console.error('[mongo] error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] disconnected');
  });

  await mongoose.connect(config.mongo.uri, buildOptions());
  return mongoose.connection;
}

/** 带退避重试的连接，避免容器启动顺序问题 */
async function connectWithRetry(attempts = 5) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await connectDB();
    } catch (err) {
      lastError = err;
      const delay = Math.min(2000 * i, 10000);
      console.error(`[mongo] connect attempt ${i}/${attempts} failed: ${err.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

async function disconnectDB() {
  await mongoose.connection.close();
}

module.exports = { connectDB, connectWithRetry, disconnectDB, isDbReady };
