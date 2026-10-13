'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');
const authService = require('../services/auth.service');

const router = express.Router();

// POST /api/auth/register
router.post(
  '/register',
  asyncHandler(async (req, res) => ok(res, await authService.register(req.body || {})))
);

// POST /api/auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => ok(res, await authService.login(req.body || {})))
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, req.user.toPublic()))
);

// POST /api/auth/logout
router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => ok(res, await authService.logout(req.tokenPayload)))
);

module.exports = router;
