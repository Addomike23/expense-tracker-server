const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const { recommendBudget, recommendAllBudgets } = require('../ml/budgetPrediction');

// Get all budgets for a user
const getBudgets = async (req, res) => {
    try {
        const budgets = await Budget.find({ 
            user_id: req.user_id,
            isActive: true 
        }).sort({ category: 1 });

        // Get current month's spending for each budget
        const currentMonth = new Date().toISOString().slice(0, 7);
        const startOfMonth = new Date(`${currentMonth}-01`);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const monthTransactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense',
            date: { $gte: startOfMonth, $lt: endOfMonth }
        });

        // Calculate spent per category
        const categorySpending = {};
        monthTransactions.forEach(t => {
            categorySpending[t.category] = (categorySpending[t.category] || 0) + t.amount;
        });

        // Merge budget with spending data
        const budgetsWithSpending = budgets.map(budget => {
            const spent = categorySpending[budget.category] || 0;
            const remaining = budget.budget - spent;
            const percentage = budget.budget > 0 ? (spent / budget.budget) * 100 : 0;

            let status = 'good';
            if (spent > budget.budget) status = 'exceeded';
            else if (percentage >= budget.alertThreshold) status = 'warning';

            return {
                _id: budget._id,
                category: budget.category,
                name: budget.name,
                budget: budget.budget,
                spent: parseFloat(spent.toFixed(2)),
                remaining: parseFloat(remaining.toFixed(2)),
                percentage: parseFloat(percentage.toFixed(2)),
                status,
                alertThreshold: budget.alertThreshold,
                period: budget.period,
                startDate: budget.startDate,
                endDate: budget.endDate,
                notes: budget.notes,
                dailyBudget: budget.period === 'daily' ? budget.budget :
                              budget.period === 'weekly' ? parseFloat((budget.budget / 7).toFixed(2)) :
                              budget.period === 'monthly' ? parseFloat((budget.budget / 30).toFixed(2)) :
                              parseFloat((budget.budget / 365).toFixed(2)),
                createdAt: budget.createdAt,
                updatedAt: budget.updatedAt
            };
        });

        // Summary
        const totalBudget = budgets.reduce((sum, b) => sum + b.budget, 0);
        const totalSpent = Object.values(categorySpending).reduce((sum, s) => sum + s, 0);
        const exceededCount = budgetsWithSpending.filter(b => b.status === 'exceeded').length;
        const warningCount = budgetsWithSpending.filter(b => b.status === 'warning').length;

        res.json({
            success: true,
            count: budgetsWithSpending.length,
            summary: {
                total_budget: parseFloat(totalBudget.toFixed(2)),
                total_spent: parseFloat(totalSpent.toFixed(2)),
                total_remaining: parseFloat((totalBudget - totalSpent).toFixed(2)),
                exceeded_budgets: exceededCount,
                warning_budgets: warningCount,
                healthy_budgets: budgetsWithSpending.length - exceededCount - warningCount
            },
            data: budgetsWithSpending
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get single budget
const getBudget = async (req, res) => {
    try {
        const budget = await Budget.findOne({
            _id: req.params.id,
            user_id: req.user_id
        });

        if (!budget) {
            return res.status(404).json({ error: 'Budget not found' });
        }

        // Get spending for this category
        const currentMonth = new Date().toISOString().slice(0, 7);
        const startOfMonth = new Date(`${currentMonth}-01`);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const transactions = await Transaction.find({
            user_id: req.user_id,
            category: budget.category,
            type: 'expense',
            date: { $gte: startOfMonth, $lt: endOfMonth }
        });

        const spent = transactions.reduce((sum, t) => sum + t.amount, 0);
        const remaining = budget.budget - spent;

        res.json({
            success: true,
            data: {
                ...budget.toObject(),
                spent: parseFloat(spent.toFixed(2)),
                remaining: parseFloat(remaining.toFixed(2)),
                percentage: budget.budget > 0 ? parseFloat(((spent / budget.budget) * 100).toFixed(2)) : 0,
                transactions: transactions.slice(0, 10)
            }
        });

    } catch (err) {
      
        
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: 'Budget not found' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Create new budget
const createBudget = async (req, res) => {
    try {
        const { 
            category, 
            name, 
            budget, 
            period,
            alertThreshold,
            notes
        } = req.body;

        // Validation
        if (!category || !name || !budget) {
            return res.status(400).json({ error: 'Category, name, and budget amount are required' });
        }

        if (budget <= 0) {
            return res.status(400).json({ error: 'Budget amount must be greater than 0' });
        }

        // Check if budget already exists for this category
        const existingBudget = await Budget.findOne({
            user_id: req.user_id,
            category: category.toLowerCase(),
            isActive: true
        });

        if (existingBudget) {
            return res.status(400).json({ 
                error: 'Budget already exists for this category',
                existing_budget: existingBudget
            });
        }

        // Calculate end date based on period
        const startDate = new Date();
        const endDate = new Date();
        
        switch(period || 'monthly') {
            case 'daily':
                endDate.setDate(endDate.getDate() + 1);
                break;
            case 'weekly':
                endDate.setDate(endDate.getDate() + 7);
                break;
            case 'monthly':
                endDate.setMonth(endDate.getMonth() + 1);
                break;
            case 'yearly':
                endDate.setFullYear(endDate.getFullYear() + 1);
                break;
            default:
                endDate.setMonth(endDate.getMonth() + 1);
        }

        const newBudget = new Budget({
            user_id: req.user_id,
            category: category.toLowerCase(),
            name,
            budget: parseFloat(budget),
            period: period || 'monthly',
            alertThreshold: alertThreshold || 80,
            startDate,
            endDate,
            notes: notes || ''
        });

        const savedBudget = await newBudget.save();

        res.status(201).json({
            success: true,
            message: 'Budget created successfully',
            data: savedBudget
        });

    } catch (err) {
     
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: messages });
        }
        
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Budget already exists for this category' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Update budget
const updateBudget = async (req, res) => {
    try {
        const { 
            name, 
            budget, 
            period,
            alertThreshold,
            isActive,
            notes
        } = req.body;

        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (budget !== undefined) {
            if (budget <= 0) {
                return res.status(400).json({ error: 'Budget amount must be greater than 0' });
            }
            updateFields.budget = parseFloat(budget);
        }
        if (period !== undefined) updateFields.period = period;
        if (alertThreshold !== undefined) {
            if (alertThreshold < 1 || alertThreshold > 100) {
                return res.status(400).json({ error: 'Alert threshold must be between 1 and 100' });
            }
            updateFields.alertThreshold = alertThreshold;
        }
        if (isActive !== undefined) updateFields.isActive = isActive;
        if (notes !== undefined) updateFields.notes = notes;

        const updatedBudget = await Budget.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user_id },
            { $set: updateFields },
            { new: true, runValidators: true }
        );

        if (!updatedBudget) {
            return res.status(404).json({ error: 'Budget not found' });
        }

        res.json({
            success: true,
            message: 'Budget updated',
            data: updatedBudget
        });

    } catch (err) {
        
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({ error: messages });
        }
        
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: 'Budget not found' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Delete budget
const deleteBudget = async (req, res) => {
    try {
        const budget = await Budget.findOneAndDelete({
            _id: req.params.id,
            user_id: req.user_id
        });

        if (!budget) {
            return res.status(404).json({ error: 'Budget not found' });
        }

        res.json({
            success: true,
            message: 'Budget deleted successfully'
        });

    } catch (err) {
       
        
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ error: 'Budget not found' });
        }
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get budget status
const getBudgetStatus = async (req, res) => {
    try {
        const budgets = await Budget.find({ 
            user_id: req.user_id,
            isActive: true 
        });

        const currentMonth = new Date().toISOString().slice(0, 7);
        const startOfMonth = new Date(`${currentMonth}-01`);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const monthTransactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense',
            date: { $gte: startOfMonth, $lt: endOfMonth }
        });

        const categorySpending = {};
        monthTransactions.forEach(t => {
            categorySpending[t.category] = (categorySpending[t.category] || 0) + t.amount;
        });

        const status = {
            total_budgets: budgets.length,
            budgets: budgets.map(budget => {
                const spent = categorySpending[budget.category] || 0;
                const remaining = budget.budget - spent;
                const percentage = budget.budget > 0 ? (spent / budget.budget) * 100 : 0;
                const daysInMonth = new Date().getDate();
                const expectedSpent = (daysInMonth / 30) * budget.budget;
                
                let status = 'good';
                if (spent > budget.budget) status = 'exceeded';
                else if (spent > expectedSpent) status = 'ahead_of_plan';
                else if (percentage >= budget.alertThreshold) status = 'warning';

                return {
                    category: budget.category,
                    name: budget.name,
                    budget: budget.budget,
                    spent: parseFloat(spent.toFixed(2)),
                    remaining: parseFloat(remaining.toFixed(2)),
                    percentage: parseFloat(percentage.toFixed(2)),
                    expected_by_now: parseFloat(expectedSpent.toFixed(2)),
                    status,
                    on_track: spent <= expectedSpent,
                    daily_remaining: parseFloat((remaining / (30 - daysInMonth)).toFixed(2))
                };
            }),
            summary: {
                exceeded: status.budgets.filter(b => b.status === 'exceeded').length,
                ahead_of_plan: status.budgets.filter(b => b.status === 'ahead_of_plan').length,
                warning: status.budgets.filter(b => b.status === 'warning').length,
                good: status.budgets.filter(b => b.status === 'good').length
            }
        };

        res.json({
            success: true,
            data: status
        });

    } catch (err) {
       
        res.status(500).json({ error: 'Server error' });
    }
};

// Get budget recommendations
const getBudgetRecommendations = async (req, res) => {
    try {
        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        });

        if (transactions.length === 0) {
            return res.status(400).json({ 
                error: 'No transactions found. Add some transactions to get budget recommendations.' 
            });
        }

        const recommendations = recommendAllBudgets(transactions);

        // Get existing budgets
        const existingBudgets = await Budget.find({ 
            user_id: req.user_id,
            isActive: true 
        });

        const existingCategories = existingBudgets.map(b => b.category);

        // Filter out categories that already have budgets
        const newRecommendations = {};
        Object.entries(recommendations).forEach(([category, data]) => {
            if (!existingCategories.includes(category)) {
                newRecommendations[category] = data;
            }
        });

        res.json({
            success: true,
            data: {
                existing_budgets: existingBudgets.map(b => ({
                    category: b.category,
                    current_budget: b.budget,
                    recommendation: recommendations[b.category] || null
                })),
                new_recommendations: newRecommendations
            }
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    getBudgets,
    getBudget,
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetStatus,
    getBudgetRecommendations
};