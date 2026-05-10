const express = require('express');
const categoryRouter = express.Router();
const { getCategories, getCategoryStats } = require('../controller/categoryController');
const auth = require('../middleware/auth');

categoryRouter.get('/', auth, getCategories);
categoryRouter.get('/:name', auth, getCategoryStats);

module.exports = categoryRouter;