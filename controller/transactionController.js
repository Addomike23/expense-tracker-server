const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

// Get all transactions for a user
const getTransactions = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 50, 
            sort = '-date',
            type,
            category,
            startDate,
            endDate,
            minAmount,
            maxAmount,
            search
        } = req.query;

        // Build filter
        const filter = { user_id: req.user_id };

        if (type) filter.type = type;
        if (category) filter.category = category.toLowerCase();
        
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
        
        if (minAmount || maxAmount) {
            filter.amount = {};
            if (minAmount) filter.amount.$gte = parseFloat(minAmount);
            if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
        }

        if (search) {
            filter.description = { $regex: search, $options: 'i' };
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get transactions
        const transactions = await Transaction.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        // Total count
        const total = await Transaction.countDocuments(filter);

        res.json({
            success: true,
            count: transactions.length,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            data: transactions
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get single transaction
const getTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            user_id: req.user_id
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json({
            success: true,
            data: transaction
        });

    } catch (err) {
       
        
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Create new transaction
const createTransaction = async (req, res) => {
    try {
        const { 
            amount, 
            category, 
            description, 
            date, 
            type,
            paymentMethod,
            tags,
            isRecurring,
            recurringFrequency,
            location,
            notes
        } = req.body;

        // Validation
        if (!amount || !category) {
            return res.status(400).json({ error: 'Amount and category are required' });
        }

        if (amount <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than 0' });
        }

        const transaction = new Transaction({
            user_id: req.user_id,
            amount: parseFloat(amount),
            category: category.toLowerCase(),
            description: description || '',
            date: date || new Date(),
            type: type || 'expense',
            paymentMethod: paymentMethod || 'cash',
            tags: tags || [category.toLowerCase()],
            isRecurring: isRecurring || false,
            recurringFrequency: isRecurring ? recurringFrequency : null,
            location: location || '',
            notes: notes || ''
        });

        const savedTransaction = await transaction.save();

        // Update budget spent amount if expense
        if (savedTransaction.type === 'expense') {
            await Budget.updateSpent(req.user_id, savedTransaction.category, savedTransaction.amount);
        }

        res.status(201).json({
            success: true,
            message: 'Transaction created',
            data: savedTransaction
        });

    } catch (err) {
        
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: messages });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Update transaction
const updateTransaction = async (req, res) => {
    try {
        const { 
            amount, 
            category, 
            description, 
            date, 
            type,
            paymentMethod,
            tags,
            isRecurring,
            recurringFrequency,
            location,
            notes
        } = req.body;

        // Find old transaction first
        const oldTransaction = await Transaction.findOne({
            _id: req.params.id,
            user_id: req.user_id
        });

        if (!oldTransaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Build update object
        const updateFields = {};
        if (amount !== undefined) updateFields.amount = parseFloat(amount);
        if (category !== undefined) updateFields.category = category.toLowerCase();
        if (description !== undefined) updateFields.description = description;
        if (date !== undefined) updateFields.date = date;
        if (type !== undefined) updateFields.type = type;
        if (paymentMethod !== undefined) updateFields.paymentMethod = paymentMethod;
        if (tags !== undefined) updateFields.tags = tags;
        if (isRecurring !== undefined) updateFields.isRecurring = isRecurring;
        if (recurringFrequency !== undefined) updateFields.recurringFrequency = recurringFrequency;
        if (location !== undefined) updateFields.location = location;
        if (notes !== undefined) updateFields.notes = notes;

        // Update transaction
        const updatedTransaction = await Transaction.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user_id },
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        // Adjust budget spent amount
        if (oldTransaction.type === 'expense') {
            // Remove old amount from budget
            await Budget.updateSpent(req.user_id, oldTransaction.category, -oldTransaction.amount);
        }
        
        if (updatedTransaction.type === 'expense') {
            // Add new amount to budget
            await Budget.updateSpent(req.user_id, updatedTransaction.category, updatedTransaction.amount);
        }

        res.json({
            success: true,
            message: 'Transaction updated',
            data: updatedTransaction
        });

    } catch (err) {
       
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: messages });
        }
        
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Delete transaction
const deleteTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findOneAndDelete({
            _id: req.params.id,
            user_id: req.user_id
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // Update budget spent amount
        if (transaction.type === 'expense') {
            await Budget.updateSpent(req.user_id, transaction.category, -transaction.amount);
        }

        res.json({
            success: true,
            message: 'Transaction deleted'
        });

    } catch (err) {
       
        
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get transaction stats
const getTransactionStats = async (req, res) => {
    try {
        const stats = await Transaction.aggregate([
            { $match: { user_id: require('mongoose').Types.ObjectId(req.user_id) } },
            {
                $group: {
                    _id: null,
                    totalTransactions: { $sum: 1 },
                    totalExpenses: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0]
                        }
                    },
                    totalIncome: {
                        $sum: {
                            $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0]
                        }
                    },
                    averageExpense: {
                        $avg: {
                            $cond: [{ $eq: ['$type', 'expense'] }, '$amount', null]
                        }
                    },
                    maxExpense: {
                        $max: {
                            $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0]
                        }
                    },
                    minExpense: {
                        $min: {
                            $cond: [{ $eq: ['$type', 'expense'] }, '$amount', null]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: stats.length > 0 ? stats[0] : {
                totalTransactions: 0,
                totalExpenses: 0,
                totalIncome: 0,
                averageExpense: 0,
                maxExpense: 0,
                minExpense: 0
            }
        });

    } catch (err) {
     
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    getTransactions,
    getTransaction,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionStats
};