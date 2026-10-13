'use strict';

const Favorite = require('../models/Favorite');
const { ApiError } = require('../utils/response');
const { normalizeIsbn } = require('../utils/isbn');

const MAX_TEXT_LENGTH = 500;

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, MAX_TEXT_LENGTH);
}

function requireIsbn(rawIsbn) {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isbn) throw new ApiError('ISBN 格式不正确，请输入 10 位或 13 位数字');
  return isbn;
}

/** 收藏列表：按 savedAt 倒序，前端直接按返回顺序渲染 */
async function list(userId) {
  const docs = await Favorite.find({ userId }).sort({ savedAt: -1 }).lean();
  return docs.map((doc) => ({
    isbn: doc.isbn,
    title: doc.title || '',
    author: doc.author || '',
    publisher: doc.publisher || '',
    cover: doc.cover || '',
    savedAt: doc.savedAt,
  }));
}

/**
 * 添加收藏：同一用户重复收藏同一 ISBN 幂等（已存在直接返回成功）
 * 图书信息可能查不到，title/author/publisher/cover 允许为空
 */
async function add(userId, body = {}) {
  const isbn = requireIsbn(body.isbn);

  const existing = await Favorite.findOne({ userId, isbn }).lean();
  if (existing) return null;

  try {
    await Favorite.create({
      userId,
      isbn,
      title: cleanText(body.title),
      author: cleanText(body.author),
      publisher: cleanText(body.publisher),
      cover: cleanText(body.cover),
      savedAt: Date.now(),
    });
  } catch (err) {
    // 并发重复插入由唯一索引兜住，同样视为成功
    if (!err || err.code !== 11000) throw err;
  }
  return null;
}

/** 取消收藏：删除不存在的记录也返回成功（幂等） */
async function remove(userId, rawIsbn) {
  const isbn = requireIsbn(rawIsbn);
  await Favorite.deleteOne({ userId, isbn });
  return null;
}

module.exports = { list, add, remove };
