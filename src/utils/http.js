'use strict';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** 带超时的 fetch（Node 18 自带 fetch），超时抛 AbortError */
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...options,
      headers: { 'User-Agent': DEFAULT_UA, ...(options.headers || {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 极简串行限流器：保证两次调用间隔不小于 interval 毫秒（豆瓣反爬） */
function createThrottle(interval) {
  let chain = Promise.resolve();
  let last = 0;
  return (task) => {
    const run = async () => {
      const wait = Math.max(0, last + interval - Date.now());
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      return task();
    };
    const result = chain.then(run, run);
    chain = result.catch(() => {});
    return result;
  };
}

module.exports = { fetchWithTimeout, createThrottle, DEFAULT_UA };
