'use strict';

const cheerio = require('cheerio');
const config = require('../config');
const { fetchWithTimeout, createThrottle } = require('../utils/http');

const name = 'dangdang';

// 有反爬，控制调用间隔
const throttle = createThrottle(config.isbn.dangdangInterval);

const SEARCH_URL = 'https://search.dangdang.com/';

const HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://search.dangdang.com/',
};

const PLACEHOLDER_COVER = /url_none|noimage|nopic|model\/guan/i;

function normalizeSpace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * 当当搜索页声明的是 GB2312，必须按 GBK 解码，否则中文全是乱码
 */
function decodeBody(rawBuffer, contentType = '') {
  const head = Buffer.from(rawBuffer).slice(0, 1024).toString('latin1');
  const declared =
    ((head.match(/charset=["']?([\w-]+)/i) || [])[1] || '') ||
    ((String(contentType).match(/charset=["']?([\w-]+)/i) || [])[1] || '');
  const charset = declared.toLowerCase();
  if (charset && !['utf-8', 'utf8', 'us-ascii', 'ascii'].includes(charset)) {
    try {
      return new TextDecoder(charset === 'gb2312' ? 'gbk' : charset).decode(rawBuffer);
    } catch (err) {
      // 环境不支持该编码时退回 utf-8
    }
  }
  return new TextDecoder('utf-8').decode(rawBuffer);
}

function normalizeDate(raw) {
  const text = normalizeSpace(raw);
  if (!text) return '';
  const match = text.match(/(\d{4})\D{0,2}(\d{1,2})?\D{0,2}(\d{1,2})?/);
  if (!match) return '';
  const [, year, month, day] = match;
  if (!month) return year;
  const mm = month.padStart(2, '0');
  if (!day) return `${year}-${mm}`;
  return `${year}-${mm}-${day.padStart(2, '0')}`;
}

/** "¥139.80" -> "139.80 元" */
function formatPrice(raw) {
  const value = Number.parseFloat(normalizeSpace(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)} 元` : '';
}

function normalizeCover(raw) {
  const value = normalizeSpace(raw);
  if (!value || PLACEHOLDER_COVER.test(value)) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return /^https?:\/\//.test(value) ? value : '';
}

/**
 * 商品标题里混着作者 / ISBN / 出版社 / 店铺广告语，
 * 用已知的这几个片段做切分，取最靠前的一刀之前的部分。
 */
function cleanTitle(raw, { isbn, author, publisher }) {
  let text = normalizeSpace(raw);
  const indexes = [isbn, author, publisher]
    .filter(Boolean)
    .map((piece) => text.indexOf(piece))
    .filter((index) => index > 0);
  if (indexes.length) text = text.slice(0, Math.min(...indexes));
  return text.replace(/[\s·・,，、|/-]+$/, '').trim();
}

/** 定位到 ISBN 对应的那个商品块（拿不到就返回 null，避免匹配到别的书） */
function findItem($, isbn) {
  const nodes = $('li[id^="p"]').toArray();
  const hit = nodes.find((node) => normalizeSpace($(node).text()).includes(isbn));
  if (hit) return hit;
  return (
    nodes.find((node) => normalizeSpace($(node).find('img').attr('alt')).includes(isbn)) || null
  );
}

function parseItem($, element, isbn) {
  const item = $(element);

  const spans = item
    .find('p.search_book_author span')
    .toArray()
    .map((span) => normalizeSpace($(span).text()).replace(/^[/|]\s*/, ''))
    .filter(Boolean);

  const author = normalizeSpace(
    item.find('p.search_book_author a[name="itemlist-author"]').attr('title') ||
      item.find('p.search_book_author a[name="itemlist-author"]').text() ||
      spans[0] ||
      ''
  );

  const publisher = normalizeSpace(
    item.find('a[name="P_cbs"]').attr('title') ||
      item.find('a[name="P_cbs"]').text() ||
      spans.find((text) => text !== author && !/\d{4}\s*[-/.年]/.test(text)) ||
      ''
  );

  const pubDate = normalizeDate(
    spans.find((text) => /\d{4}\s*[-/.年]\s*\d{1,2}/.test(text)) || ''
  );

  // 搜索页里 search_pre_price 是「定价」，search_now_price 是售价，优先取定价
  const price = formatPrice(
    item.find('.search_pre_price').first().text() || item.find('.search_now_price').first().text()
  );

  const cover = normalizeCover(
    item.find('img').attr('data-original') || item.find('img').attr('data-src') || ''
  );

  const rawTitle =
    item.find('a.pic').attr('title') ||
    item.find('img').attr('alt') ||
    item.find('p.name a').text() ||
    '';
  const title = cleanTitle(rawTitle, { isbn, author, publisher });

  if (!title) return null;
  return { isbn, title, author, publisher, pubDate, price, cover, summary: '' };
}

async function fetchByIsbn(isbn) {
  if (!config.isbn.dangdangEnabled) return null;

  return throttle(async () => {
    const url = `${SEARCH_URL}?key=${encodeURIComponent(isbn)}&act=input`;
    const res = await fetchWithTimeout(
      url,
      { headers: HEADERS, redirect: 'follow' },
      config.isbn.dangdangTimeout
    );
    if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = decodeBody(buffer, res.headers.get('content-type'));
    const $ = cheerio.load(html);

    const element = findItem($, isbn);
    if (!element) return null;
    return parseItem($, element, isbn);
  });
}

module.exports = { name, fetchByIsbn, parseItem, cleanTitle, normalizeDate, formatPrice };
