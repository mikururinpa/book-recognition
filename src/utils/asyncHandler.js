'use strict';

/** 包装 async 路由，异常统一交给错误中间件 */
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
