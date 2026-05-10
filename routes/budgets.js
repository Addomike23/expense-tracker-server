const express = require('express');
const budgetRouter = express.Router();
const { 
    getBudgets, 
    getBudget, 
    createBudget, 
    updateBudget, 
    deleteBudget, 
    getBudgetStatus,
    getBudgetRecommendations 
} = require('../controller/budgetController');
const auth = require('../middleware/auth');

budgetRouter.get('/', auth, getBudgets);
budgetRouter.get('/status', auth, getBudgetStatus);
budgetRouter.get('/recommendations', auth, getBudgetRecommendations);
budgetRouter.get('/:id', auth, getBudget);
budgetRouter.post('/', auth, createBudget);
budgetRouter.put('/:id', auth, updateBudget);
budgetRouter.delete('/:id', auth, deleteBudget);

module.exports = budgetRouter;