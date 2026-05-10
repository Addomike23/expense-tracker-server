const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { detectCategoryAnomalies } = require('../ml/anomalyDetection');
const { predictCategorySpending, recommendBudget } = require('../ml/budgetPrediction');

// Get all categories with spending data
const getCategories = async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        
        // Calculate date range
        const startDate = new Date();
        switch(period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'quarter':
                startDate.setMonth(startDate.getMonth() - 3);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 1);
        }

        // Get transactions for the period
        const transactions = await Transaction.find({
            user_id: req.user_id,
            date: { $gte: startDate }
        }).sort({ date: -1 });

        // Get budgets
        const budgets = await Budget.find({ 
            user_id: req.user_id,
            isActive: true 
        });

        // Group transactions by category
        const categories = {};
        
        transactions.forEach(t => {
            if (!categories[t.category]) {
                categories[t.category] = {
                    name: t.category,
                    total_spent: 0,
                    transaction_count: 0,
                    income: 0,
                    expenses: 0,
                    transactions: [],
                    average_transaction: 0,
                    max_transaction: 0,
                    min_transaction: Infinity,
                    first_transaction: t.date,
                    last_transaction: t.date
                };
            }

            const cat = categories[t.category];
            
            if (t.type === 'income') {
                cat.income += t.amount;
            } else {
                cat.expenses += t.amount;
                cat.total_spent += t.amount;
            }
            
            cat.transaction_count += 1;
            cat.transactions.push(t);
            
            // Track max/min for expense transactions
            if (t.type === 'expense') {
                cat.max_transaction = Math.max(cat.max_transaction, t.amount);
                cat.min_transaction = Math.min(cat.min_transaction, t.amount);
            }

            // Track first and last transaction dates
            if (t.date < cat.first_transaction) cat.first_transaction = t.date;
            if (t.date > cat.last_transaction) cat.last_transaction = t.date;
        });

        // Calculate additional metrics and merge with budgets
        const categoryList = Object.entries(categories).map(([name, data]) => {
            // Find matching budget
            const budget = budgets.find(b => b.category === name);
            
            // Calculate averages
            const averageExpense = data.transaction_count > 0 
                ? data.expenses / data.transaction_count 
                : 0;

            // Budget status
            let budgetStatus = null;
            let remaining = null;
            let percentage = null;
            
            if (budget) {
                remaining = budget.budget - data.total_spent;
                percentage = budget.budget > 0 ? (data.total_spent / budget.budget) * 100 : 0;
                
                if (data.total_spent > budget.budget) {
                    budgetStatus = 'exceeded';
                } else if (percentage >= budget.alertThreshold) {
                    budgetStatus = 'warning';
                } else {
                    budgetStatus = 'good';
                }
            }

            return {
                name,
                display_name: name.charAt(0).toUpperCase() + name.slice(1),
                total_spent: parseFloat(data.total_spent.toFixed(2)),
                income: parseFloat(data.income.toFixed(2)),
                expenses: parseFloat(data.expenses.toFixed(2)),
                transaction_count: data.transaction_count,
                average_transaction: parseFloat(averageExpense.toFixed(2)),
                max_transaction: data.max_transaction !== 0 ? parseFloat(data.max_transaction.toFixed(2)) : 0,
                min_transaction: data.min_transaction !== Infinity ? parseFloat(data.min_transaction.toFixed(2)) : 0,
                first_transaction: data.first_transaction,
                last_transaction: data.last_transaction,
                budget: budget ? {
                    id: budget._id,
                    amount: budget.budget,
                    spent: parseFloat(data.total_spent.toFixed(2)),
                    remaining: parseFloat(remaining?.toFixed(2) || 0),
                    percentage: parseFloat(percentage?.toFixed(2) || 0),
                    status: budgetStatus,
                    period: budget.period,
                    alert_threshold: budget.alertThreshold
                } : null,
                recent_transactions: data.transactions.slice(0, 5)
            };
        });

        // Sort by total spent (highest first)
        categoryList.sort((a, b) => b.total_spent - a.total_spent);

        // Summary
        const totalSpent = categoryList.reduce((sum, c) => sum + c.total_spent, 0);
        const categoriesWithBudget = categoryList.filter(c => c.budget).length;
        const categoriesExceeded = categoryList.filter(c => c.budget?.status === 'exceeded').length;

        res.json({
            success: true,
            count: categoryList.length,
            period,
            summary: {
                total_categories: categoryList.length,
                categories_with_budget: categoriesWithBudget,
                categories_without_budget: categoryList.length - categoriesWithBudget,
                categories_exceeded: categoriesExceeded,
                total_spent: parseFloat(totalSpent.toFixed(2))
            },
            data: categoryList
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get single category details
const getCategoryStats = async (req, res) => {
    try {
        const categoryName = req.params.name.toLowerCase();
        const { months = 6 } = req.query;

        // Get all transactions for this category
        const transactions = await Transaction.find({
            user_id: req.user_id,
            category: categoryName
        }).sort({ date: -1 });

        if (transactions.length === 0) {
            return res.status(404).json({ error: 'No transactions found for this category' });
        }

        // Monthly breakdown
        const monthlyData = {};
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));

        transactions.forEach(t => {
            const monthKey = t.date.toISOString().slice(0, 7);
            if (t.date >= cutoffDate) {
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { month: monthKey, expenses: 0, income: 0, count: 0 };
                }
                if (t.type === 'expense') {
                    monthlyData[monthKey].expenses += t.amount;
                } else {
                    monthlyData[monthKey].income += t.amount;
                }
                monthlyData[monthKey].count += 1;
            }
        });

        const monthlyArray = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

        // Basic stats
        const expenses = transactions.filter(t => t.type === 'expense');
        const income = transactions.filter(t => t.type === 'income');
        
        const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
        const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
        const averageExpense = expenses.length > 0 ? totalExpenses / expenses.length : 0;

        // Get budget
        const budget = await Budget.findOne({
            user_id: req.user_id,
            category: categoryName,
            isActive: true
        });

        // Anomaly detection
        const anomalies = detectCategoryAnomalies(transactions);

        // Spending prediction
        const monthlyExpenses = monthlyArray.map(m => m.expenses);
        let prediction = null;
        
        if (monthlyExpenses.length >= 2) {
            const categoryHistory = { [categoryName]: monthlyExpenses };
            const predictions = predictCategorySpending(categoryHistory);
            prediction = predictions[categoryName] || null;
        }

        // Budget recommendation
        const budgetRecommendation = recommendBudget(transactions, categoryName);

        res.json({
            success: true,
            data: {
                category: categoryName,
                display_name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
                stats: {
                    total_transactions: transactions.length,
                    total_expenses: parseFloat(totalExpenses.toFixed(2)),
                    total_income: parseFloat(totalIncome.toFixed(2)),
                    average_expense: parseFloat(averageExpense.toFixed(2)),
                    max_expense: expenses.length > 0 ? Math.max(...expenses.map(t => t.amount)) : 0,
                    min_expense: expenses.length > 0 ? Math.min(...expenses.map(t => t.amount)) : 0,
                    first_transaction: transactions[transactions.length - 1].date,
                    last_transaction: transactions[0].date
                },
                monthly_breakdown: monthlyArray.map(m => ({
                    ...m,
                    expenses: parseFloat(m.expenses.toFixed(2)),
                    income: parseFloat(m.income.toFixed(2))
                })),
                budget: budget ? {
                    amount: budget.budget,
                    spent: parseFloat(totalExpenses.toFixed(2)),
                    remaining: parseFloat((budget.budget - totalExpenses).toFixed(2)),
                    status: totalExpenses > budget.budget ? 'exceeded' : 'good'
                } : null,
                anomalies: anomalies.slice(0, 5),
                prediction,
                budget_recommendation: budgetRecommendation,
                recent_transactions: transactions.slice(0, 10),
                payment_methods: getPaymentMethodBreakdown(transactions)
            }
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Helper: Payment method breakdown
function getPaymentMethodBreakdown(transactions) {
    const breakdown = {};
    transactions.forEach(t => {
        const method = t.paymentMethod || 'cash';
        if (!breakdown[method]) {
            breakdown[method] = { count: 0, total: 0 };
        }
        breakdown[method].count += 1;
        breakdown[method].total += t.amount;
    });

    return Object.entries(breakdown).map(([method, data]) => ({
        method,
        count: data.count,
        total: parseFloat(data.total.toFixed(2))
    }));
}

module.exports = {
    getCategories,
    getCategoryStats
};