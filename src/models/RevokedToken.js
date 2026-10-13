'use strict';

const mongoose = require('mongoose');

/**
 * 退出登录后立即失效的实现：把 token 的 jti 记入黑名单，到期由 TTL 自动清理。
 */
const revokedTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expireAt: { type: Date, required: true },
  },
  {
    versionKey: false,
    collection: 'revoked_tokens',
  }
);

revokedTokenSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
