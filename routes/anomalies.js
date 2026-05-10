const express = require('express');
const anomalyRouter = express.Router();
const { 
    getAnomalies, 
    getCategoryAnomalies, 
    getDailySpikes,
    getAnomalySummary 
} = require('../controller/anomalyController');
const auth = require('../middleware/auth');

anomalyRouter.get('/', auth, getAnomalies);
anomalyRouter.get('/summary', auth, getAnomalySummary);
anomalyRouter.get('/spikes', auth, getDailySpikes);
anomalyRouter.get('/categories/:category', auth, getCategoryAnomalies);

module.exports = anomalyRouter;