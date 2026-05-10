const ss = require('simple-statistics');

/**
 * Z-Score Anomaly Detection
 * Flags transactions that are more than 2 standard deviations from the mean
 */
function detectAnomalies(transactions) {
    if (transactions.length < 3) return [];

    const amounts = transactions.map(t => t.amount);
    const mean = ss.mean(amounts);
    const stdDev = ss.standardDeviation(amounts);

    if (stdDev === 0) return [];

    return transactions.filter(t => {
        const zScore = Math.abs((t.amount - mean) / stdDev);
        return zScore > 2;
    });
}

/**
 * IQR (Interquartile Range) Anomaly Detection
 * Flags transactions that fall outside 1.5x the IQR
 */
function detectAnomaliesIQR(transactions) {
    if (transactions.length < 4) return [];

    const amounts = transactions.map(t => t.amount).sort((a, b) => a - b);
    const q1 = ss.quantile(amounts, 0.25);
    const q3 = ss.quantile(amounts, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return transactions.filter(t => t.amount < lowerBound || t.amount > upperBound);
}

/**
 * Category-Based Anomaly Detection
 * Detects unusual spending within each category
 */
function detectCategoryAnomalies(transactions) {
    const categoryGroups = {};

    // Group transactions by category
    transactions.forEach(t => {
        if (t.type === 'expense') {
            if (!categoryGroups[t.category]) {
                categoryGroups[t.category] = [];
            }
            categoryGroups[t.category].push(t);
        }
    });

    const anomalies = [];

    Object.entries(categoryGroups).forEach(([category, categoryTransactions]) => {
        if (categoryTransactions.length < 3) return;

        const amounts = categoryTransactions.map(t => t.amount);
        const mean = ss.mean(amounts);
        const stdDev = ss.standardDeviation(amounts);

        if (stdDev === 0) return;

        categoryTransactions.forEach(t => {
            const zScore = Math.abs((t.amount - mean) / stdDev);
            if (zScore > 2) {
                anomalies.push({
                    ...t.toObject ? t.toObject() : t,
                    anomaly_type: 'category_spike',
                    z_score: parseFloat(zScore.toFixed(2)),
                    category_mean: parseFloat(mean.toFixed(2)),
                    category_std: parseFloat(stdDev.toFixed(2))
                });
            }
        });
    });

    return anomalies;
}

/**
 * Sudden Spike Detection
 * Compares daily totals to detect unusual daily spending
 */
function detectDailySpikes(transactions) {
    const dailyTotals = {};

    // Group by date
    transactions.forEach(t => {
        const dateKey = new Date(t.date).toISOString().split('T')[0];
        if (!dailyTotals[dateKey]) {
            dailyTotals[dateKey] = 0;
        }
        dailyTotals[dateKey] += t.amount;
    });

    const days = Object.keys(dailyTotals).sort();
    if (days.length < 3) return [];

    const dailyAmounts = days.map(d => dailyTotals[d]);
    const mean = ss.mean(dailyAmounts);
    const stdDev = ss.standardDeviation(dailyAmounts);

    if (stdDev === 0) return [];

    const spikeDays = [];

    days.forEach((day, index) => {
        const zScore = (dailyAmounts[index] - mean) / stdDev;
        if (zScore > 2) {
            spikeDays.push({
                date: day,
                total: dailyAmounts[index],
                z_score: parseFloat(zScore.toFixed(2)),
                transactions: transactions.filter(t => 
                    new Date(t.date).toISOString().split('T')[0] === day
                )
            });
        }
    });

    return spikeDays;
}

/**
 * Run all anomaly detection methods
 * Returns consolidated results
 */
function runAllDetection(transactions) {
    const expenses = transactions.filter(t => t.type === 'expense');

    const zScoreAnomalies = detectAnomalies(expenses);
    const iqrAnomalies = detectAnomaliesIQR(expenses);
    const categoryAnomalies = detectCategoryAnomalies(expenses);
    const dailySpikes = detectDailySpikes(expenses);

    // Combine unique anomaly IDs
    const anomalyIds = new Set();
    const combinedAnomalies = [];

    [...zScoreAnomalies, ...iqrAnomalies].forEach(t => {
        const id = t._id ? t._id.toString() : t.id;
        if (!anomalyIds.has(id)) {
            anomalyIds.add(id);
            combinedAnomalies.push({
                ...(t.toObject ? t.toObject() : t),
                detected_by: t.detected_by || 'zscore_iqr'
            });
        }
    });

    return {
        total_anomalies: combinedAnomalies.length + categoryAnomalies.length,
        transaction_anomalies: combinedAnomalies,
        category_anomalies: categoryAnomalies,
        daily_spikes: dailySpikes,
        summary: {
            total_transactions: expenses.length,
            anomaly_percentage: expenses.length > 0 
                ? parseFloat(((combinedAnomalies.length / expenses.length) * 100).toFixed(2))
                : 0
        }
    };
}

module.exports = {
    detectAnomalies,
    detectAnomaliesIQR,
    detectCategoryAnomalies,
    detectDailySpikes,
    runAllDetection
};