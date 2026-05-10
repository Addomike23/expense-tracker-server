const Transaction = require('../models/Transaction');
const { 
    predictNextMonthSpending, 
    predictCategorySpending, 
    predictMultipleMonths,
    recommendAllBudgets,
    calculateSavingsPotential,
    detectSeasonalPattern
} = require('../ml/budgetPrediction');

// Predict next month's spending
const getMonthlyPrediction = async (req, res) => {
    try {
        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.status(400).json({ error: 'No transactions found for prediction' });
        }

        // Group by month
        const monthlyData = {};
        transactions.forEach(t => {
            const monthKey = t.date.toISOString().slice(0, 7);
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { expenses: 0, income: 0, count: 0 };
            }
            monthlyData[monthKey].expenses += t.amount;
            monthlyData[monthKey].count += 1;
        });

        const incomeTransactions = await Transaction.find({
            user_id: req.user_id,
            type: 'income'
        }).sort({ date: 1 });

        incomeTransactions.forEach(t => {
            const monthKey = t.date.toISOString().slice(0, 7);
            if (monthlyData[monthKey]) {
                monthlyData[monthKey].income += t.amount;
            }
        });

        const sortedMonths = Object.keys(monthlyData).sort();
        const monthlyExpenses = sortedMonths.map(m => monthlyData[m].expenses);
        const monthlyIncome = sortedMonths.map(m => monthlyData[m].income);

        // Predictions
        const singlePrediction = predictNextMonthSpending(monthlyExpenses);
        const multiPrediction = predictMultipleMonths(monthlyExpenses, 3);
        const seasonalPattern = detectSeasonalPattern(monthlyExpenses);

        res.json({
            success: true,
            data: {
                historical_data: sortedMonths.map((month, i) => ({
                    month,
                    expenses: parseFloat(monthlyExpenses[i].toFixed(2)),
                    income: parseFloat(monthlyIncome[i].toFixed(2)),
                    count: monthlyData[month].count
                })),
                next_month: singlePrediction,
                next_three_months: multiPrediction,
                seasonal_analysis: seasonalPattern,
                data_points: sortedMonths.length,
                confidence_note: sortedMonths.length < 3 
                    ? 'Add more months of data for better predictions' 
                    : sortedMonths.length < 6 
                        ? 'Predictions are improving with more data'
                        : 'Good amount of historical data'
            }
        });

    } catch (err) {
       
        res.status(500).json({ error: 'Server error' });
    }
};

// Predict category spending
const getCategoryPredictions = async (req, res) => {
    try {
        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.status(400).json({ error: 'No transactions found for prediction' });
        }

        // Group by category and month
        const categoryHistory = {};
        
        transactions.forEach(t => {
            const monthKey = t.date.toISOString().slice(0, 7);
            
            if (!categoryHistory[t.category]) {
                categoryHistory[t.category] = {};
            }
            if (!categoryHistory[t.category][monthKey]) {
                categoryHistory[t.category][monthKey] = 0;
            }
            categoryHistory[t.category][monthKey] += t.amount;
        });

        // Convert to arrays for prediction
        const formattedHistory = {};
        Object.entries(categoryHistory).forEach(([category, months]) => {
            formattedHistory[category] = Object.keys(months)
                .sort()
                .map(month => months[month]);
        });

        // Get predictions
        const predictions = predictCategorySpending(formattedHistory);

        // Add historical data
        const result = Object.entries(predictions).map(([category, prediction]) => ({
            category,
            display_name: category.charAt(0).toUpperCase() + category.slice(1),
            predicted_amount: prediction.predicted_amount,
            confidence: prediction.confidence,
            trend: prediction.trend,
            historical_data: formattedHistory[category].map((amount, i) => ({
                month: Object.keys(categoryHistory[category]).sort()[i],
                amount: parseFloat(amount.toFixed(2))
            }))
        }));

        // Sort by predicted amount (highest first)
        result.sort((a, b) => b.predicted_amount - a.predicted_amount);

        res.json({
            success: true,
            count: result.length,
            data: result
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get budget recommendations
const getRecommendations = async (req, res) => {
    try {
        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        });

        if (transactions.length === 0) {
            return res.status(400).json({ error: 'No transactions found. Add transactions to get recommendations.' });
        }

        const recommendations = recommendAllBudgets(transactions);

        // Format recommendations
        const formattedRecommendations = Object.entries(recommendations)
            .map(([category, data]) => ({
                category,
                display_name: category.charAt(0).toUpperCase() + category.slice(1),
                ...data
            }))
            .sort((a, b) => b.recommended_budget - a.recommended_budget);

        res.json({
            success: true,
            count: formattedRecommendations.length,
            data: formattedRecommendations,
            note: 'Recommendations based on median spending with 15% buffer'
        });

    } catch (err) {
       
        res.status(500).json({ error: 'Server error' });
    }
};

// Get savings potential
const getSavingsPotential = async (req, res) => {
    try {
        // Get current month transactions
        const currentMonth = new Date().toISOString().slice(0, 7);
        const startOfMonth = new Date(`${currentMonth}-01`);
        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        const expenses = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        });

        const monthIncome = await Transaction.find({
            user_id: req.user_id,
            type: 'income',
            date: { $gte: startOfMonth, $lt: endOfMonth }
        });

        const totalMonthlyIncome = monthIncome.reduce((sum, t) => sum + t.amount, 0);
        const savingsAnalysis = calculateSavingsPotential(expenses, totalMonthlyIncome);

        // Category breakdown for savings opportunities
        const currentMonthExpenses = expenses.filter(t => 
            t.date >= startOfMonth && t.date < endOfMonth
        );

        const categoryTotals = {};
        currentMonthExpenses.forEach(t => {
            categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
        });

        const topExpenses = Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([category, total]) => ({
                category,
                total: parseFloat(total.toFixed(2)),
                percentage_of_expenses: savingsAnalysis.average_monthly_expenses > 0
                    ? parseFloat(((total / savingsAnalysis.average_monthly_expenses) * 100).toFixed(2))
                    : 0
            }));

        res.json({
            success: true,
            data: {
                ...savingsAnalysis,
                top_expense_categories: topExpenses,
                savings_tips: generateSavingsTips(savingsAnalysis, topExpenses)
            }
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get seasonal analysis
const getSeasonalAnalysis = async (req, res) => {
    try {
        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        }).sort({ date: 1 });

        if (transactions.length < 3) {
            return res.status(400).json({ 
                error: 'Need at least 3 months of data for seasonal analysis' 
            });
        }

        // Monthly totals
        const monthlyData = {};
        transactions.forEach(t => {
            const monthKey = t.date.toISOString().slice(0, 7);
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = 0;
            }
            monthlyData[monthKey] += t.amount;
        });

        const monthlyTotals = Object.keys(monthlyData).sort().map(m => monthlyData[m]);
        const seasonalPattern = detectSeasonalPattern(monthlyTotals);

        // Month-over-month changes
        const monthOverMonth = [];
        const months = Object.keys(monthlyData).sort();
        
        for (let i = 1; i < months.length; i++) {
            const current = monthlyData[months[i]];
            const previous = monthlyData[months[i - 1]];
            const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
            
            monthOverMonth.push({
                month: months[i],
                spending: parseFloat(current.toFixed(2)),
                previous_month: parseFloat(previous.toFixed(2)),
                change_percent: parseFloat(change.toFixed(2)),
                direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable'
            });
        }

        res.json({
            success: true,
            data: {
                seasonal_pattern: seasonalPattern,
                month_over_month: monthOverMonth,
                average_monthly_spending: parseFloat(
                    (monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length).toFixed(2)
                ),
                highest_month: {
                    month: months[monthlyTotals.indexOf(Math.max(...monthlyTotals))],
                    amount: Math.max(...monthlyTotals)
                },
                lowest_month: {
                    month: months[monthlyTotals.indexOf(Math.min(...monthlyTotals))],
                    amount: Math.min(...monthlyTotals)
                }
            }
        });

    } catch (err) {
       
        res.status(500).json({ error: 'Server error' });
    }
};

// Generate savings tips
function generateSavingsTips(savingsAnalysis, topExpenses) {
    const tips = [];

    if (savingsAnalysis.savings_rate < 10) {
        tips.push({
            priority: 'high',
            tip: 'Your savings rate is very low. Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.'
        });
    } else if (savingsAnalysis.savings_rate < 20) {
        tips.push({
            priority: 'medium',
            tip: 'You\'re saving some money, but increasing to 20% would build your emergency fund faster.'
        });
    } else {
        tips.push({
            priority: 'low',
            tip: 'Great savings rate! Consider investing your extra savings for long-term growth.'
        });
    }

    if (topExpenses.length > 0) {
        tips.push({
            priority: 'medium',
            tip: `Your top expense is ${topExpenses[0].category} at $${topExpenses[0].total}. Look for ways to reduce this category.`
        });
    }

    tips.push({
        priority: 'info',
        tip: 'Track your subscriptions and cancel unused ones. The average person spends $219/month on subscriptions.'
    });

    tips.push({
        priority: 'info',
        tip: 'Try the 24-hour rule: Wait 24 hours before making non-essential purchases over $50.'
    });

    return tips;
}

module.exports = {
    getMonthlyPrediction,
    getCategoryPredictions,
    getRecommendations,
    getSavingsPotential,
    getSeasonalAnalysis
};