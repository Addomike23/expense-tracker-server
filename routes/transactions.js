const express = require('express');
const transactionRouter = express.Router();
const { 
    getTransactions, 
    getTransaction, 
    createTransaction, 
    updateTransaction, 
    deleteTransaction,
    getTransactionStats 
} = require('../controller/transactionController');
const protect = require('../middleware/auth');

// Apply auth middleware to all routes
transactionRouter.use(protect);

/**
 * @route   GET /api/transactions
 * @desc    Get all transactions for logged in user
 * @access  Private
 * @query   page, limit, sort, type, category, startDate, endDate, minAmount, maxAmount, search
 */
transactionRouter.get('/', getTransactions);

/**
 * @route   GET /api/transactions/stats
 * @desc    Get transaction statistics
 * @access  Private
 */
transactionRouter.get('/stats', getTransactionStats);

/**
 * @route   GET /api/transactions/:id
 * @desc    Get single transaction by ID
 * @access  Private
 */
transactionRouter.get('/:id', getTransaction);

/**
 * @route   POST /api/transactions
 * @desc    Create a new transaction
 * @access  Private
 * @body    amount, category, description, date, type, paymentMethod, tags, isRecurring, location, notes
 */
transactionRouter.post('/', createTransaction);

/**
 * @route   PUT /api/transactions/:id
 * @desc    Update a transaction
 * @access  Private
 */
transactionRouter.put('/:id', updateTransaction);

/**
 * @route   DELETE /api/transactions/:id
 * @desc    Delete a transaction
 * @access  Private
 */
transactionRouter.delete('/:id', deleteTransaction);

module.exports = transactionRouter;