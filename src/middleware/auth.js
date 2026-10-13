'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');
const { fail } = require('../utils/response');

const UNAUTHORIZED_MESSAGE = '登录已过期，请重新登录';

function readToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const value = String(header);
  if (/^Bearer\s+/i.test(value)) return value.replace(/^Bearer\s+/i, '').trim();
  // 兼容小程序 query 传参方式（可选）
  return '';
}

/**
 * 鉴权中间件：校验 JWT -> 检查黑名单 -> 加载用户
 * 失败统一 401，前端会清 token 并跳回登录页
 */
async function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return fail(res, '未登录或登录已过期', 401);

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return fail(res, UNAUTHORIZED_MESSAGE, 401);
  }

  try {
    if (payload.jti) {
      const revoked = await RevokedToken.exists({ jti: payload.jti });
      if (revoked) return fail(res, UNAUTHORIZED_MESSAGE, 401);
    }
    const user = await User.findById(payload.sub);
    if (!user) return fail(res, '账号不存在，请重新登录', 401);

    req.user = user;
    req.tokenPayload = payload;
    req.token = token;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireAuth };
