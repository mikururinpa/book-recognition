'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ApiError } = require('../utils/response');
const { signToken, revokeToken } = require('./token.service');

const ACCOUNT_MIN = 3;
const ACCOUNT_MAX = 32;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 16;
const SALT_ROUNDS = 10;

function validateAccount(account) {
  if (typeof account !== 'string') return '账号格式不正确';
  const value = account.trim();
  if (value.length < ACCOUNT_MIN || value.length > ACCOUNT_MAX) {
    return `账号长度需在 ${ACCOUNT_MIN}~${ACCOUNT_MAX} 个字符之间`;
  }
  if (/\s/.test(value)) return '账号不能包含空格';
  return null;
}

function validatePassword(password) {
  if (typeof password !== 'string') return '密码格式不正确';
  if (password.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 位`;
  if (password.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 位`;
  return null;
}

function normalizeAccount(account) {
  return typeof account === 'string' ? account.trim() : '';
}

const ACCOUNT_EXISTS_MESSAGE = '该账号已注册，直接去登录';

/** 注册：返回账号信息（不自动登录，前端注册成功后跳回登录页） */
async function register(body = {}) {
  const account = normalizeAccount(body.account);
  const password = body.password;

  const accountError = validateAccount(account);
  if (accountError) throw new ApiError(accountError);
  const passwordError = validatePassword(password);
  if (passwordError) throw new ApiError(passwordError);

  const exists = await User.exists({ account });
  if (exists) throw new ApiError(ACCOUNT_EXISTS_MESSAGE);

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    const user = await User.create({ account, passwordHash, createdAt: Date.now() });
    return { account: user.account, createdAt: user.createdAt };
  } catch (err) {
    if (err && err.code === 11000) throw new ApiError(ACCOUNT_EXISTS_MESSAGE);
    throw err;
  }
}

/** 登录：校验密码，签发 token */
async function login(body = {}) {
  const account = normalizeAccount(body.account);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!account || !password) throw new ApiError('请输入账号和密码');

  const user = await User.findOne({ account }).select('+passwordHash');
  // 账号不存在与密码错误返回同一提示，避免账号枚举
  if (!user) throw new ApiError('账号或密码错误');

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) throw new ApiError('账号或密码错误');

  const { token, expiresAt } = signToken(user);
  return { token, account: user.account, expiresAt };
}

/** 退出登录：token 立即失效（黑名单） */
async function logout(payload) {
  await revokeToken(payload);
  return null;
}

module.exports = {
  register,
  login,
  logout,
  validateAccount,
  validatePassword,
};
