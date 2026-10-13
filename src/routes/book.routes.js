'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const bookService = require('../services/book.service');

const router = express.Router();

const lookup = asyncHandler(async (req, res) => {
  const isbn = req.params.isbn || req.query.isbn;
  return ok(res, await bookService.getBook(isbn));
});

// GET /api/book?isbn=9787576358629
router.get('/', lookup);
// GET /api/book/:isbn
router.get('/:isbn', lookup);

module.exports = router;
