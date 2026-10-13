'use strict';

const config = require('../config');
const { fetchWithTimeout } = require('../utils/http');

const name = 'isbn.work';

function pickString(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const first = value.find((v) => v !== null && v !== undefined && String(v).trim() !== '');
      if (first !== undefined) return String(first).trim();
      continue;
    }
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

/**
 * isbn.work 的 price 单位是「分」（13990 -> "139.90 元"）。
 * 已带小数或单位时按原值归一，避免二次换算。
 */
function normalizePrice(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw <= 0) return '';
    const yuan = raw >= 1000 ? raw / 100 : raw;
    return `${yuan.toFixed(2)} 元`;
  }
  const text = String(raw).trim();
  if (!text) return '';
  if (text.includes('.') || text.includes('元')) {
    const value = Number.parseFloat(text.replace(/[^\d.]/g, ''));
    return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)} 元` : text;
  }
  const cents = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
  if (!Number.isFinite(cents) || cents <= 0) return text;
  return `${(cents / 100).toFixed(2)} 元`;
}

/** pictures 是 JSON 字符串数组，形如 "[\"https://...\"]" */
function normalizeCover(raw) {
  if (!raw) return '';
  if (Array.isArray(raw)) {
    const first = raw.find((v) => typeof v === 'string' && /^https?:\/\//.test(v.trim()));
    return first ? first.trim() : '';
  }
  const text = String(raw).trim();
  if (/^https?:\/\//.test(text)) return text;
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      return normalizeCover(parsed);
    } catch (err) {
      return '';
    }
  }
  return '';
}

/** 兼容 "2025-09-01" / "2025.9" / "2025年9月" */
function normalizeDate(raw) {
  const text = pickString(raw);
  if (!text) return '';
  const match = text.match(/(\d{4})\D{0,2}(\d{1,2})?\D{0,2}(\d{1,2})?/);
  if (!match) return '';
  const [, year, month, day] = match;
  if (!month) return year;
  const mm = month.padStart(2, '0');
  if (!day) return `${year}-${mm}`;
  return `${year}-${mm}-${day.padStart(2, '0')}`;
}

/** 从多种返回结构里取出图书数据对象 */
function extractPayload(json) {
  if (!json || typeof json !== 'object') return null;

  const code = json.code ?? json.status ?? json.resultCode;
  const isBizFail =
    code !== undefined &&
    code !== null &&
    !['0', '200', 'success', 'ok', 'true'].includes(String(code).toLowerCase().trim());
  if (isBizFail) return null;

  let data = json.data ?? json.result ?? json.books ?? null;
  if (Array.isArray(data)) data = data[0] || null;
  if (data && typeof data === 'object' && !data.bookName && data.data) {
    const inner = Array.isArray(data.data) ? data.data[0] : data.data;
    if (inner && typeof inner === 'object') data = inner;
  }
  if (!data || typeof data !== 'object') {
    // 有的实现把图书字段平铺在顶层
    if (json.bookName || json.title) return json;
    return null;
  }
  return data;
}

/** 第三方原始字段 -> 本文档字段（务必转换，直接透传前端会显示空白） */
function mapToBook(isbn, payload) {
  const title = pickString(payload.bookName, payload.title, payload.name);
  if (!title) return null;

  return {
    isbn,
    title,
    author: pickString(payload.author, payload.authors, payload.writer),
    publisher: pickString(payload.press, payload.publisher, payload.pressName),
    pubDate: normalizeDate(payload.pressDate ?? payload.publishDate ?? payload.pubDate),
    price: normalizePrice(payload.price),
    cover: normalizeCover(payload.pictures ?? payload.picture ?? payload.cover ?? payload.image),
    summary: pickString(payload.bookDesc, payload.summary, payload.description, payload.intro),
  };
}

async function fetchByIsbn(isbn) {
  if (!config.isbn.appKey) return null;

  const url = `${config.isbn.endpoint}?appKey=${encodeURIComponent(config.isbn.appKey)}&isbn=${encodeURIComponent(isbn)}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: 'application/json' } },
    config.isbn.timeout
  );
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);

  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`${name} 返回的不是合法 JSON`);
  }

  const payload = extractPayload(json);
  if (!payload) return null;
  return mapToBook(isbn, payload);
}

module.exports = { name, fetchByIsbn, normalizePrice, normalizeCover, normalizeDate, mapToBook };
