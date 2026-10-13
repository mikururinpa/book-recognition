'use strict';

const cheerio = require('cheerio');
const config = require('../config');
const { fetchWithTimeout, createThrottle } = require('../utils/http');

const name = 'douban';

// 豆瓣有反爬，必须控制频率
const throttle = createThrottle(config.isbn.doubanInterval);

const LABELS = [
  '副标题',
  '原作名',
  '作者',
  '译者',
  '出版社',
  '出品方',
  '出版年',
  '页数',
  '定价',
  '装帧',
  '丛书',
  'ISBN',
];

const HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://book.douban.com/',
};

function normalizeSpace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
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

function normalizePrice(raw) {
  const text = normalizeSpace(raw);
  if (!text) return '';
  const value = Number.parseFloat(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)} 元` : '';
}

/** 把 #info 的整段文本按已知标签切成键值对 */
function extractFields(text) {
  const source = normalizeSpace(text);
  const re = new RegExp(`(${LABELS.join('|')})\\s*[:：]`, 'g');
  const marks = [];
  let match = re.exec(source);
  while (match) {
    marks.push({ label: match[1], start: match.index, valueStart: re.lastIndex });
    match = re.exec(source);
  }
  const fields = {};
  marks.forEach((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].start : source.length;
    fields[mark.label] = source.slice(mark.valueStart, end).trim();
  });
  return fields;
}

// 豆瓣默认占位图不是真实封面，返回给前端会显示成错误图片
const PLACEHOLDER_COVER = /book-default-lpic|book-default-spic|\/no-image|nopic|default_book/i;

function pickCover(...candidates) {
  for (const candidate of candidates) {
    const url = normalizeSpace(candidate);
    if (url && /^https?:\/\//.test(url) && !PLACEHOLDER_COVER.test(url)) return url;
  }
  return '';
}

function parseHtml(html, isbn) {
  if (!html) return null;
  const $ = cheerio.load(html);

  const title =
    normalizeSpace($('#wrapper h1 span[property="v:itemreviewed"]').first().text()) ||
    normalizeSpace($('#wrapper h1').first().text()).replace(/^\s*《|》\s*$/g, '') ||
    normalizeSpace($('meta[property="og:title"]').attr('content'));
  if (!title) return null;

  const fields = extractFields($('#info').text());

  const cover = pickCover(
    $('#mainpic img').attr('src'),
    $('#mainpic img').attr('data-src'),
    $('a.nbg img').attr('src'),
    $('meta[property="og:image"]').attr('content')
  );

  const summary =
    normalizeSpace($('[property="v:summary"]').first().text()) ||
    normalizeSpace($('#link-report .intro').first().text()) ||
    normalizeSpace($('.related_info .intro').first().text()) ||
    normalizeSpace($('meta[property="og:description"]').attr('content'));

  return {
    isbn,
    title,
    author: normalizeSpace(fields['作者'] || fields['译者']),
    publisher: normalizeSpace(fields['出版社'] || fields['出品方']),
    pubDate: normalizeDate(fields['出版年']),
    price: normalizePrice(fields['定价']),
    cover,
    summary,
  };
}

async function requestPage(url) {
  const res = await fetchWithTimeout(
    url,
    { redirect: 'manual', headers: HEADERS },
    config.isbn.doubanTimeout
  );

  // 302 跳到书籍详情页，HTML 在跳转后的地址
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) return null;
    const target = new URL(location, url).toString();
    if (!/book\.douban\.com/.test(target)) return null;
    const page = await fetchWithTimeout(target, { headers: HEADERS }, config.isbn.doubanTimeout);
    if (!page.ok) throw new Error(`${name} HTTP ${page.status}`);
    return page.text();
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
  return res.text();
}

async function fetchByIsbn(isbn) {
  if (!config.isbn.doubanEnabled) return null;
  return throttle(async () => {
    const html = await requestPage(`https://book.douban.com/isbn/${encodeURIComponent(isbn)}/`);
    return parseHtml(html, isbn);
  });
}

module.exports = { name, fetchByIsbn, parseHtml, normalizeDate, normalizePrice };
