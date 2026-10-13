'use strict';

/** ISBN-10 校验位转 ISBN-13 校验位 */
function checkDigit13(core12) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(core12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function isbn10To13(isbn10) {
  const core12 = `978${isbn10.slice(0, 9)}`;
  return `${core12}${checkDigit13(core12)}`;
}

/**
 * 归一化 ISBN：去掉空格/连字符，ISBN-10 统一转成 ISBN-13（第三方接口主要认 13 位）。
 * 非法输入返回 null。
 */
function normalizeIsbn(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{13}$/.test(raw)) return raw;
  if (/^\d{9}[\dX]$/.test(raw)) return isbn10To13(raw);
  return null;
}

module.exports = { normalizeIsbn, isbn10To13 };
