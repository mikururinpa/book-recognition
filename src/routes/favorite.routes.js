'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');
const favoriteService = require('../services/favorite.service');

const router = express.Router();

router.use(requireAuth);

// GET /api/favorites
router.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await favoriteService.list(req.user._id)))
);

// POST /api/favorites
router.post(
  '/',
  asyncHandler(async (req, res) => ok(res, await favoriteService.add(req.user._id, req.body || {})))
);

// DELETE /api/favorites/:isbn
router.delete(
  '/:isbn',
  asyncHandler(async (req, res) => ok(res, await favoriteService.remove(req.user._id, req.params.isbn)))
);

module.exports = router;
