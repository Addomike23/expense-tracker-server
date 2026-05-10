const express = require('express');
const dashboardRouter = express.Router();
const { getDashboard, getSummary, getMonthlyStats } = require('../controller/dashboardController');
const auth = require('../middleware/auth');

dashboardRouter.get('/', auth, getDashboard);
dashboardRouter.get('/summary', auth, getSummary);
dashboardRouter.get('/monthly', auth, getMonthlyStats);

module.exports = dashboardRouter;