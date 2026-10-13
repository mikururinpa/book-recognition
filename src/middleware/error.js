'use strict';

const config = require('../config');
const { ApiError, fail } = require('../utils/response');

function notFoundHandler(req, res) {
  return fail(res, `接口不存在：${req.method} ${req.originalUrl}`, 404);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return;

  if (err instanceof ApiError) {
    return fail(res, err.message, err.status || 200);
  }
  if (err && err.type === 'entity.parse.failed') {
    return fail(res, '请求体不是合法的 JSON', 400);
  }
  if (err && err.type === 'entity.too.large') {
    return fail(res, '请求内容过大', 400);
  }
  if (err && (err.name === 'MongoServerSelectionError' || err.name === 'MongooseServerSelectionError')) {
    console.error('[error] mongo unavailable:', err.message);
    return fail(res, '服务暂时不可用，请稍后再试', 500);
  }

  console.error('[error]', req.method, req.originalUrl, err);
  const message = config.env === 'production' ? '服务暂时不可用，请稍后再试' : `服务异常：${err.message}`;
  return fail(res, message, 500);
}

module.exports = { notFoundHandler, errorHandler };
