'use strict';

const config = require('../config');
const BookCache = require('../models/BookCache');
const { ApiError } = require('../utils/response');
const { normalizeIsbn } = require('../utils/isbn');
const isbnWork = require('../providers/isbnWork');
const douban = require('../providers/douban');
const dangdang = require('../providers/dangdang');

// 数据源优先级：isbn.work（最全） -> 豆瓣 -> 当当
// 各源能拿到的字段不同，取到后会互相补齐（先到先得，后面的源只填空缺）
const PROVIDERS = [isbnWork, douban, dangdang];

const MERGE_FIELDS = ['title', 'author', 'publisher', 'pubDate', 'price', 'cover', 'summary'];

const NOT_FOUND_MESSAGE = '接口里没有这本书的记录';

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function readCache(isbn) {
  try {
    const cached = await BookCache.findOne({ isbn }).lean();
    if (!cached) return undefined;
    if (cached.expireAt && new Date(cached.expireAt).getTime() <= Date.now()) return undefined;
    return cached;
  } catch (err) {
    // 缓存不可用不应阻断查询，降级直连第三方
    console.warn('[book] 读取缓存失败，降级查询第三方:', err.message);
    return undefined;
  }
}

async function writeCache(isbn, book) {
  const found = Boolean(book && book.title);
  try {
    await BookCache.updateOne(
      { isbn },
      {
        $set: {
          isbn,
          found,
          source: found ? book.source || '' : '',
          data: found ? book : null,
          updatedAt: new Date(),
          expireAt: found ? daysFromNow(config.cache.hitTtlDays) : hoursFromNow(config.cache.missTtlHours),
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[book] 写入缓存失败:', err.message);
  }
}

function toResponse(book) {
  return {
    isbn: book.isbn,
    title: book.title,
    author: book.author || '',
    publisher: book.publisher || '',
    pubDate: book.pubDate || '',
    price: book.price || '',
    cover: book.cover || '',
    summary: book.summary || '',
  };
}

/** 用后续数据源填补前面数据源缺失的字段 */
function mergeBook(target, source) {
  const merged = { ...target };
  MERGE_FIELDS.forEach((field) => {
    if (!merged[field] && source[field]) merged[field] = source[field];
  });
  return merged;
}

/** 关键字段齐了就不再请求后面的数据源，省第三方额度 */
function isComplete(book) {
  return Boolean(book.title && book.author && book.publisher && (book.price || book.pubDate));
}

async function lookupFromProviders(isbn) {
  let merged = { isbn };
  const sources = [];

  for (const provider of PROVIDERS) {
    try {
      const book = await provider.fetchByIsbn(isbn);
      // title 为空的记录前端会当作查询失败
      if (!book || !book.title) continue;
      sources.push(provider.name);
      merged = mergeBook(merged, book);
      if (isComplete(merged)) break;
    } catch (err) {
      console.warn(`[book] 数据源 ${provider.name} 查询失败: ${err.message}`);
    }
  }

  if (!merged.title) return null;
  return { ...merged, source: sources.join('+') };
}

/**
 * 按 ISBN 查图书信息：缓存优先 -> 第三方 -> 回写缓存
 * 查不到抛业务错误（200 + ok:false）
 */
async function getBook(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) throw new ApiError('ISBN 格式不正确，请输入 10 位或 13 位数字');

  const cached = await readCache(isbn);
  if (cached) {
    if (!cached.found) throw new ApiError(NOT_FOUND_MESSAGE);
    return toResponse(cached.data);
  }

  const book = await lookupFromProviders(isbn);
  await writeCache(isbn, book);
  if (!book) throw new ApiError(NOT_FOUND_MESSAGE);

  return toResponse(book);
}

module.exports = { getBook, NOT_FOUND_MESSAGE };
