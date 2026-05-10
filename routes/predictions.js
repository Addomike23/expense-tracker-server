const express = require('express');
const predictionRouter = express.Router();
const { 
    getMonthlyPrediction, 
    getCategoryPredictions, 
    getRecommendations, 
    getSavingsPotential,
    getSeasonalAnalysis 
} = require('../controller/predictionController');
const auth = require('../middleware/auth');

predictionRouter.get('/monthly', auth, getMonthlyPrediction);
predictionRouter.get('/categories', auth, getCategoryPredictions);
predictionRouter.get('/recommendations', auth, getRecommendations);
predictionRouter.get('/savings', auth, getSavingsPotential);
predictionRouter.get('/seasonal', auth, getSeasonalAnalysis);

module.exports = predictionRouter;