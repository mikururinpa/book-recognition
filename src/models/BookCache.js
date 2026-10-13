'use strict';

const mongoose = require('mongoose');

/**
 * ISBN 查询缓存：免费额度有限，命中就不再打第三方。
 * 命中缓存 TTL 较长，未命中（miss）只缓存很短时间。
 */
const bookCacheSchema = new mongoose.Schema(
  {
    isbn: { type: String, required: true, unique: true, index: true },
    found: { type: Boolean, required: true, default: false },
    source: { type: String, default: '' },
    data: { type: Object, default: null },
    updatedAt: { type: Date, required: true, default: () => new Date() },
    expireAt: { type: Date, required: true },
  },
  {
    versionKey: false,
    collection: 'book_cache',
  }
);

// 到期自动清理
bookCacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BookCache', bookCacheSchema);
