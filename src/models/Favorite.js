'use strict';

const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    isbn: { type: String, required: true, trim: true },
    // 图书信息可能查不到，除 isbn 外全部允许为空
    title: { type: String, default: '' },
    author: { type: String, default: '' },
    publisher: { type: String, default: '' },
    cover: { type: String, default: '' },
    savedAt: { type: Number, required: true, default: () => Date.now() },
  },
  {
    versionKey: false,
    collection: 'favorites',
  }
);

// 同一用户同一 ISBN 唯一，配合 upsert 实现幂等
favoriteSchema.index({ userId: 1, isbn: 1 }, { unique: true });

favoriteSchema.methods.toPublic = function toPublic() {
  return {
    isbn: this.isbn,
    title: this.title || '',
    author: this.author || '',
    publisher: this.publisher || '',
    cover: this.cover || '',
    savedAt: this.savedAt,
  };
};

module.exports = mongoose.model('Favorite', favoriteSchema);
