'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    account: { type: String, required: true, unique: true, trim: true, index: true },
    // bcrypt 加盐哈希，绝不存明文
    passwordHash: { type: String, required: true, select: false },
    createdAt: { type: Number, required: true, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() },
  },
  {
    versionKey: false,
    collection: 'users',
  }
);

userSchema.methods.toPublic = function toPublic() {
  return { account: this.account, createdAt: this.createdAt };
};

module.exports = mongoose.model('User', userSchema);
