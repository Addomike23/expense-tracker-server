const regression = require('regression');
const ss = require('simple-statistics');

/**
 * Predict next month's total spending using Linear Regression
 */
function predictNextMonthSpending(monthlyTotals) {
    if (monthlyTotals.length < 2) {
        return { 
            prediction: monthlyTotals.length === 1 ? monthlyTotals[0] : 0, 
            confidence: 'low' 
        };
    }

    // Format: [[monthIndex, amount], ...]
    const data = monthlyTotals.map((amount, index) => [index, amount]);
    const result = regression.linear(data);
    
    const nextMonth = monthlyTotals.length;
    const prediction = result.predict(nextMonth)[1];

    // Confidence based on R-squared
    const confidence = result.r2 > 0.7 ? 'high' : result.r2 > 0.4 ? 'medium' : 'low';

    return {
        prediction: parseFloat(Math.max(0, prediction).toFixed(2)),
        confidence,
        r_squared: parseFloat(result.r2.toFixed(4)),
        trend: result.equation[0] > 0.01 ? 'increasing' : 
               result.equation[0] < -0.01 ? 'decreasing' : 'stable',
        slope: parseFloat(result.equation[0].toFixed(4))
    };
}

/**
 * Predict category-wise spending for next month
 */
function predictCategorySpending(categoryHistory) {
    const predictions = {};

    Object.entries(categoryHistory).forEach(([category, monthlyAmounts]) => {
        if (monthlyAmounts.length >= 2) {
            const data = monthlyAmounts.map((amount, i) => [i, amount]);
            const result = regression.linear(data);
            
            predictions[category] = {
                predicted_amount: parseFloat(Math.max(0, result.predict(monthlyAmounts.length)[1]).toFixed(2)),
                confidence: result.r2 > 0.7 ? 'high' : result.r2 > 0.4 ? 'medium' : 'low',
                trend: result.equation[0] > 0 ? 'increasing' : 
                       result.equation[0] < 0 ? 'decreasing' : 'stable'
            };
        } else if (monthlyAmounts.length === 1) {
            predictions[category] = {
                predicted_amount: monthlyAmounts[0],
                confidence: 'low',
                trend: 'stable'
            };
        }
    });

    return predictions;
}

/**
 * Predict next 3 months of spending (multi-month forecast)
 */
function predictMultipleMonths(monthlyTotals, monthsAhead = 3) {
    if (monthlyTotals.length < 3) {
        return {
            predictions: [],
            confidence: 'low',
            message: 'Need at least 3 months of data for multi-month forecast'
        };
    }

    const data = monthlyTotals.map((amount, index) => [index, amount]);
    const result = regression.linear(data);
    
    const predictions = [];
    for (let i = 0; i < monthsAhead; i++) {
        const monthIndex = monthlyTotals.length + i;
        const predicted = result.predict(monthIndex)[1];
        
        predictions.push({
            month: monthIndex + 1,
            predicted_amount: parseFloat(Math.max(0, predicted).toFixed(2))
        });
    }

    return {
        predictions,
        confidence: result.r2 > 0.7 ? 'high' : result.r2 > 0.4 ? 'medium' : 'low',
        trend: result.equation[0] > 0 ? 'increasing' : 
               result.equation[0] < 0 ? 'decreasing' : 'stable'
    };
}

/**
 * Calculate recommended budget based on spending patterns
 */
function recommendBudget(transactions, category, bufferPercent = 15) {
    const categoryTransactions = transactions
        .filter(t => t.category === category && t.type === 'expense')
        .map(t => t.amount);

    if (categoryTransactions.length === 0) return null;

    const mean = ss.mean(categoryTransactions);
    const median = ss.median(categoryTransactions);
    const stdDev = ss.standardDeviation(categoryTransactions);

    // Use median for recommendation (less affected by outliers)
    const base = median;
    const buffer = base * (bufferPercent / 100);

    return {
        category,
        recommended_budget: parseFloat((base + buffer).toFixed(2)),
        average_spending: parseFloat(mean.toFixed(2)),
        median_spending: parseFloat(median.toFixed(2)),
        std_deviation: parseFloat(stdDev.toFixed(2)),
        transaction_count: categoryTransactions.length,
        buffer_percent: bufferPercent
    };
}

/**
 * Calculate recommended budgets for all categories
 */
function recommendAllBudgets(transactions, bufferPercent = 15) {
    const categories = {};

    transactions
        .filter(t => t.type === 'expense')
        .forEach(t => {
            if (!categories[t.category]) {
                categories[t.category] = [];
            }
            categories[t.category].push(t);
        });

    const recommendations = {};

    Object.entries(categories).forEach(([category, categoryTransactions]) => {
        const amounts = categoryTransactions.map(t => t.amount);
        
        recommendations[category] = {
            recommended_budget: parseFloat(
                (ss.median(amounts) * (1 + bufferPercent / 100)).toFixed(2)
            ),
            average_spending: parseFloat(ss.mean(amounts).toFixed(2)),
            median_spending: parseFloat(ss.median(amounts).toFixed(2)),
            transaction_count: amounts.length,
            min_spent: Math.min(...amounts),
            max_spent: Math.max(...amounts)
        };
    });

    return recommendations;
}

/**
 * Calculate savings potential based on spending trends
 */
function calculateSavingsPotential(transactions, monthlyIncome) {
    const expenses = transactions
        .filter(t => t.type === 'expense')
        .map(t => t.amount);

    if (expenses.length === 0) {
        return {
            average_monthly_expenses: 0,
            savings_potential: monthlyIncome,
            savings_rate: 100
        };
    }

    const averageExpense = ss.mean(expenses);
    const medianExpense = ss.median(expenses);
    const savingsPotential = Math.max(0, monthlyIncome - medianExpense);
    const savingsRate = monthlyIncome > 0 ? (savingsPotential / monthlyIncome) * 100 : 0;

    return {
        average_monthly_expenses: parseFloat(averageExpense.toFixed(2)),
        median_monthly_expenses: parseFloat(medianExpense.toFixed(2)),
        monthly_income: monthlyIncome,
        savings_potential: parseFloat(savingsPotential.toFixed(2)),
        savings_rate: parseFloat(savingsRate.toFixed(2)),
        recommendation: savingsRate >= 30 ? 'Great savings rate!' :
                        savingsRate >= 20 ? 'Good savings rate' :
                        savingsRate >= 10 ? 'Try to save more' :
                        'Urgent: Reduce expenses'
    };
}

/**
 * Seasonal pattern detection (compare month-over-month)
 */
function detectSeasonalPattern(monthlyTotals) {
    if (monthlyTotals.length < 3) {
        return { has_seasonal_pattern: false, message: 'Need more data' };
    }

    const changes = [];
    for (let i = 1; i < monthlyTotals.length; i++) {
        const percentChange = ((monthlyTotals[i] - monthlyTotals[i - 1]) / monthlyTotals[i - 1]) * 100;
        changes.push(percentChange);
    }

    const avgChange = ss.mean(changes.map(Math.abs));
    const stdChange = ss.standardDeviation(changes.map(Math.abs));

    return {
        has_seasonal_pattern: stdChange > 10,
        average_monthly_change: parseFloat(avgChange.toFixed(2)),
        volatility: stdChange > 20 ? 'high' : stdChange > 10 ? 'medium' : 'low',
        monthly_changes: changes.map(c => parseFloat(c.toFixed(2)))
    };
}

module.exports = {
    predictNextMonthSpending,
    predictCategorySpending,
    predictMultipleMonths,
    recommendBudget,
    recommendAllBudgets,
    calculateSavingsPotential,
    detectSeasonalPattern
};