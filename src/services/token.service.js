'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const RevokedToken = require('../models/RevokedToken');

/** 签发 JWT，返回 token / 过期时间（毫秒时间戳）/ jti */
function signToken(user) {
  const jti = crypto.randomUUID();
  // jti 通过 options 写入，payload 里不要再带同名属性，否则 jsonwebtoken 会报错
  const token = jwt.sign(
    { sub: String(user._id), account: user.account },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn, jwtid: jti }
  );
  const decoded = jwt.decode(token) || {};
  return { token, jti, expiresAt: (decoded.exp || 0) * 1000 };
}

/** 退出登录：把 jti 写入黑名单，到期由 TTL 索引自动清理 */
async function revokeToken(payload) {
  if (!payload || !payload.jti || !payload.exp) return false;
  await RevokedToken.updateOne(
    { jti: payload.jti },
    {
      $setOnInsert: {
        jti: payload.jti,
        userId: payload.sub,
        expireAt: new Date(payload.exp * 1000),
      },
    },
    { upsert: true }
  );
  return true;
}

module.exports = { signToken, revokeToken };
