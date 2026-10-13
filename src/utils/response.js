'use strict';

/**
 * 统一响应结构：{ ok, data, message }
 * 业务失败（密码错误、书查不到）走 200 + ok:false，避免和网络异常混淆。
 */
function ok(res, data = null, message = '') {
  return res.status(200).json({ ok: true, data, message });
}

function fail(res, message, status = 200) {
  return res.status(status).json({ ok: false, message });
}

/** 业务异常：status 默认 200（业务失败），401/500 用于鉴权与系统异常 */
class ApiError extends Error {
  constructor(message, status = 200) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

module.exports = { ok, fail, ApiError };
