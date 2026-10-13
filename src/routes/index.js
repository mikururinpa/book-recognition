'use strict';

const express = require('express');
const config = require('../config');
const { ok } = require('../utils/response');
const { rateLimit } = require('../middleware/rateLimit');
const { isDbReady } = require('../db/connect');

const authRoutes = require('./auth.routes');
const bookRoutes = require('./book.routes');
const favoriteRoutes = require('./favorite.routes');

const router = express.Router();

// GET /api/health —— 部署探活
router.get('/health', (req, res) =>
  ok(res, {
    status: 'ok',
    db: isDbReady() ? 'connected' : 'disconnected',
    env: config.env,
    uptime: Math.round(process.uptime()),
    time: Date.now(),
  })
);

const limiters = config.rateLimit.enabled
  ? {
      auth: rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.authMax }),
      book: rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.bookMax }),
      general: rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
    }
  : { auth: (r, s, n) => n(), book: (r, s, n) => n(), general: (r, s, n) => n() };

router.use(limiters.general);

router.use('/auth', limiters.auth, authRoutes);
router.use('/book', limiters.book, bookRoutes);
router.use('/favorites', favoriteRoutes);

module.exports = router;
