'use strict';

const { fail } = require('../utils/response');

/**
 * 极简内存限流（防刷）。单实例够用；多实例部署建议换成 Redis 计数。
 */
function rateLimit({ windowMs = 60000, max = 120, message = '请求过于频繁，请稍后再试' } = {}) {
  const buckets = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  if (timer.unref) timer.unref();

  return (req, res, next) => {
    const key = `${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return fail(res, message);
    }
    return next();
  };
}

module.exports = { rateLimit };
