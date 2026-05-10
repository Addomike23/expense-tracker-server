const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const { runAllDetection, detectDailySpikes } = require('../ml/anomalyDetection');
const { 
    predictNextMonthSpending, 
    predictCategorySpending, 
    calculateSavingsPotential,
    detectSeasonalPattern 
} = require('../ml/budgetPrediction');

// Main dashboard - all data combined
const getDashboard = async (req, res) => {
    try {
        const userId = req.user_id;

        // Get all transactions
        const transactions = await Transaction.find({ user_id: userId }).sort({ date: -1 });

        // Get active budgets
        const budgets = await Budget.find({ user_id: userId, isActive: true });

        // Separate income and expenses
        const expenses = transactions.filter(t => t.type === 'expense');
        const income = transactions.filter(t => t.type === 'income');

        // ===== BASIC METRICS =====
        const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
        const balance = totalIncome - totalExpenses;

        // ===== CATEGORY BREAKDOWN =====
        const categoryBreakdown = {};
        expenses.forEach(t => {
            if (!categoryBreakdown[t.category]) {
                categoryBreakdown[t.category] = { total: 0, count: 0 };
            }
            categoryBreakdown[t.category].total += t.amount;
            categoryBreakdown[t.category].count += 1;
        });

        // ===== RECENT TRANSACTIONS =====
        const recent = transactions.slice(0, 5);

        // ===== MONTHLY SUMMARY =====
        const monthlyData = {};
        transactions.forEach(t => {
            const monthKey = t.date.toISOString().slice(0, 7);
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { income: 0, expenses: 0, count: 0 };
            }
            if (t.type === 'income') {
                monthlyData[monthKey].income += t.amount;
            } else {
                monthlyData[monthKey].expenses += t.amount;
            }
            monthlyData[monthKey].count += 1;
        });

        // Sort monthly data
        const sortedMonths = Object.keys(monthlyData).sort();
        const currentMonth = new Date().toISOString().slice(0, 7);
        const currentMonthData = monthlyData[currentMonth] || { income: 0, expenses: 0, count: 0 };

        // Monthly totals array for prediction
        const monthlyExpenseTotals = sortedMonths.map(month => monthlyData[month].expenses);
        const monthlyIncomeTotals = sortedMonths.map(month => monthlyData[month].income);

        // ===== ANOMALY DETECTION =====
        const anomalyResults = runAllDetection(expenses);

        // ===== PREDICTIVE BUDGETING =====
        const spendingPrediction = predictNextMonthSpending(monthlyExpenseTotals);
        
        // Category predictions
        const categoryHistory = {};
        sortedMonths.forEach(month => {
            const monthTransactions = transactions.filter(t => 
                t.date.toISOString().slice(0, 7) === month && t.type === 'expense'
            );
            monthTransactions.forEach(t => {
                if (!categoryHistory[t.category]) {
                    categoryHistory[t.category] = [];
                }
            });
            
            Object.keys(categoryHistory).forEach(cat => {
                const catTotal = monthTransactions
                    .filter(t => t.category === cat)
                    .reduce((sum, t) => sum + t.amount, 0);
                categoryHistory[cat].push(catTotal);
            });
        });

        const categoryPredictions = predictCategorySpending(categoryHistory);

        // ===== SAVINGS ANALYSIS =====
        const savingsAnalysis = calculateSavingsPotential(expenses, totalIncome);

        // ===== SEASONAL PATTERN =====
        const seasonalPattern = detectSeasonalPattern(monthlyExpenseTotals);

        // ===== BUDGET STATUS =====
        const budgetStatus = budgets.map(budget => {
            const spent = categoryBreakdown[budget.category]?.total || 0;
            const remaining = budget.budget - spent;
            const percentage = budget.budget > 0 ? (spent / budget.budget) * 100 : 0;
            
            let status = 'good';
            if (spent > budget.budget) status = 'exceeded';
            else if (percentage >= budget.alertThreshold) status = 'warning';
            
            return {
                id: budget._id,
                category: budget.category,
                name: budget.name,
                budget: budget.budget,
                spent: parseFloat(spent.toFixed(2)),
                remaining: parseFloat(remaining.toFixed(2)),
                percentage: parseFloat(percentage.toFixed(2)),
                status,
                alertThreshold: budget.alertThreshold
            };
        });

        // ===== DAILY SPENDING =====
        const dailySpikes = detectDailySpikes(expenses);

        // ===== TOP SPENDING CATEGORIES =====
        const topCategories = Object.entries(categoryBreakdown)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5)
            .map(([category, data]) => ({
                category,
                total: parseFloat(data.total.toFixed(2)),
                count: data.count,
                percentage: totalExpenses > 0 
                    ? parseFloat(((data.total / totalExpenses) * 100).toFixed(2))
                    : 0
            }));

        // Build response
        res.json({
            success: true,
            data: {
                // Basic Metrics
                balance: parseFloat(balance.toFixed(2)),
                total_income: parseFloat(totalIncome.toFixed(2)),
                total_expenses: parseFloat(totalExpenses.toFixed(2)),
                transaction_count: transactions.length,
                expense_count: expenses.length,
                income_count: income.length,

                // Current Month
                current_month: {
                    month: currentMonth,
                    income: parseFloat(currentMonthData.income.toFixed(2)),
                    expenses: parseFloat(currentMonthData.expenses.toFixed(2)),
                    count: currentMonthData.count
                },

                // Category Breakdown
                category_breakdown: Object.entries(categoryBreakdown).map(([category, data]) => ({
                    category,
                    total: parseFloat(data.total.toFixed(2)),
                    count: data.count
                })),

                // Top Categories
                top_categories: topCategories,

                // Recent Transactions
                recent_transactions: recent,

                // Monthly Summary
                monthly_summary: sortedMonths.map(month => ({
                    month,
                    income: parseFloat(monthlyData[month].income.toFixed(2)),
                    expenses: parseFloat(monthlyData[month].expenses.toFixed(2)),
                    savings: parseFloat((monthlyData[month].income - monthlyData[month].expenses).toFixed(2)),
                    count: monthlyData[month].count
                })),

                // Budget Status
                budget_status: budgetStatus,

                // Anomaly Detection
                anomalies: {
                    total_anomalies: anomalyResults.total_anomalies,
                    transaction_anomalies: anomalyResults.transaction_anomalies.slice(0, 10),
                    category_anomalies: anomalyResults.category_anomalies.slice(0, 10),
                    daily_spikes: dailySpikes,
                    summary: anomalyResults.summary
                },

                // Predictive Budgeting
                predictions: {
                    next_month_spending: spendingPrediction,
                    category_predictions: categoryPredictions,
                    savings_analysis: savingsAnalysis,
                    seasonal_pattern: seasonalPattern
                },

                // Insights (auto-generated tips)
                insights: generateInsights({
                    balance,
                    totalIncome,
                    totalExpenses,
                    budgetStatus,
                    anomalyResults,
                    spendingPrediction,
                    savingsAnalysis,
                    topCategories
                })
            }
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Quick summary
const getSummary = async (req, res) => {
    try {
        const userId = req.user_id;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const startOfMonth = new Date(`${currentMonth}-01`);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const monthTransactions = await Transaction.find({
            user_id: userId,
            date: { $gte: startOfMonth, $lt: endOfMonth }
        });

        const monthIncome = monthTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);

        const monthExpenses = monthTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);

        const totalTransactions = await Transaction.countDocuments({ user_id: userId });

        const budgets = await Budget.find({ user_id: userId, isActive: true });
        const exceededBudgets = budgets.filter(b => {
            const spent = monthTransactions
                .filter(t => t.category === b.category && t.type === 'expense')
                .reduce((sum, t) => sum + t.amount, 0);
            return spent > b.budget;
        });

        res.json({
            success: true,
            data: {
                current_month: currentMonth,
                month_income: parseFloat(monthIncome.toFixed(2)),
                month_expenses: parseFloat(monthExpenses.toFixed(2)),
                month_balance: parseFloat((monthIncome - monthExpenses).toFixed(2)),
                total_transactions: totalTransactions,
                active_budgets: budgets.length,
                exceeded_budgets: exceededBudgets.length
            }
        });

    } catch (err) {
       
        res.status(500).json({ error: 'Server error' });
    }
};

// Monthly statistics
const getMonthlyStats = async (req, res) => {
    try {
        const userId = req.user_id;
        const months = parseInt(req.query.months) || 6;

        const transactions = await Transaction.find({ user_id: userId })
            .sort({ date: -1 });

        const monthlyData = {};
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - months);

        transactions.forEach(t => {
            if (t.date >= cutoffDate) {
                const monthKey = t.date.toISOString().slice(0, 7);
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = {
                        month: monthKey,
                        income: 0,
                        expenses: 0,
                        count: 0,
                        categories: {}
                    };
                }
                if (t.type === 'income') {
                    monthlyData[monthKey].income += t.amount;
                } else {
                    monthlyData[monthKey].expenses += t.amount;
                    if (!monthlyData[monthKey].categories[t.category]) {
                        monthlyData[monthKey].categories[t.category] = 0;
                    }
                    monthlyData[monthKey].categories[t.category] += t.amount;
                }
                monthlyData[monthKey].count += 1;
            }
        });

        const sortedData = Object.values(monthlyData)
            .sort((a, b) => a.month.localeCompare(b.month))
            .map(m => ({
                ...m,
                income: parseFloat(m.income.toFixed(2)),
                expenses: parseFloat(m.expenses.toFixed(2)),
                savings: parseFloat((m.income - m.expenses).toFixed(2)),
                categories: Object.entries(m.categories).map(([cat, total]) => ({
                    category: cat,
                    total: parseFloat(total.toFixed(2))
                })).sort((a, b) => b.total - a.total)
            }));

        res.json({
            success: true,
            data: sortedData
        });

    } catch (err) {
   
        res.status(500).json({ error: 'Server error' });
    }
};

// Generate smart insights
function generateInsights(data) {
    const insights = [];

    // Balance insight
    if (data.balance < 0) {
        insights.push({
            type: 'warning',
            message: 'Your balance is negative. Consider reducing expenses this month.',
            icon: '⚠️'
        });
    } else if (data.balance > data.totalIncome * 0.3) {
        insights.push({
            type: 'success',
            message: `Great job! You've saved ${((data.balance / data.totalIncome) * 100).toFixed(0)}% of your income.`,
            icon: '🎉'
        });
    }

    // Budget warnings
    const exceededBudgets = data.budgetStatus.filter(b => b.status === 'exceeded');
    if (exceededBudgets.length > 0) {
        insights.push({
            type: 'danger',
            message: `Budget exceeded for: ${exceededBudgets.map(b => b.category).join(', ')}`,
            icon: '🚨'
        });
    }

    const warningBudgets = data.budgetStatus.filter(b => b.status === 'warning');
    if (warningBudgets.length > 0) {
        insights.push({
            type: 'warning',
            message: `Approaching budget limit for: ${warningBudgets.map(b => b.category).join(', ')}`,
            icon: '⚠️'
        });
    }

    // Anomaly insight
    if (data.anomalyResults.total_anomalies > 0) {
        insights.push({
            type: 'info',
            message: `${data.anomalyResults.total_anomalies} unusual transaction(s) detected. Review your recent spending.`,
            icon: '🔍'
        });
    }

    // Spending prediction insight
    if (data.spendingPrediction.trend === 'increasing') {
        insights.push({
            type: 'info',
            message: `Your spending is trending upward. Next month's predicted expenses: $${data.spendingPrediction.prediction}`,
            icon: '📈'
        });
    } else if (data.spendingPrediction.trend === 'decreasing') {
        insights.push({
            type: 'success',
            message: 'Your spending is trending downward. Keep it up!',
            icon: '📉'
        });
    }

    // Savings insight
    if (data.savingsAnalysis.savings_rate < 10) {
        insights.push({
            type: 'warning',
            message: `Your savings rate is only ${data.savingsAnalysis.savings_rate.toFixed(1)}%. Aim for at least 20%.`,
            icon: '💡'
        });
    }

    // Top category insight
    if (data.topCategories.length > 0) {
        const topCategory = data.topCategories[0];
        if (topCategory.percentage > 50) {
            insights.push({
                type: 'info',
                message: `${topCategory.category} makes up ${topCategory.percentage}% of your expenses. Can you reduce it?`,
                icon: '🎯'
            });
        }
    }

    return insights;
}

module.exports = {
    getDashboard,
    getSummary,
    getMonthlyStats
};