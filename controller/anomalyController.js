const Transaction = require('../models/Transaction');
const { 
    detectAnomalies, 
    detectAnomaliesIQR, 
    detectCategoryAnomalies, 
    detectDailySpikes,
    runAllDetection 
} = require('../ml/anomalyDetection');

// Get all anomalies
const getAnomalies = async (req, res) => {
    try {
        const { 
            method = 'all',
            threshold = 2,
            startDate,
            endDate 
        } = req.query;

        // Build date filter
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const query = {
            user_id: req.user_id,
            type: 'expense'
        };

        if (startDate || endDate) {
            query.date = dateFilter;
        }

        const transactions = await Transaction.find(query).sort({ date: -1 });

        if (transactions.length === 0) {
            return res.json({
                success: true,
                data: {
                    total_anomalies: 0,
                    message: 'No transactions found for anomaly detection',
                    anomalies: []
                }
            });
        }

        let results;

        switch(method) {
            case 'zscore':
                const zScoreAnomalies = detectAnomalies(transactions);
                results = {
                    method: 'Z-Score',
                    anomalies: zScoreAnomalies.map(t => ({
                        ...t.toObject(),
                        anomaly_type: 'zscore',
                        z_score: parseFloat(
                            (Math.abs(t.amount - getMean(transactions)) / getStdDev(transactions)).toFixed(2)
                        )
                    }))
                };
                break;

            case 'iqr':
                const iqrAnomalies = detectAnomaliesIQR(transactions);
                results = {
                    method: 'IQR (Interquartile Range)',
                    anomalies: iqrAnomalies.map(t => ({
                        ...t.toObject(),
                        anomaly_type: 'iqr'
                    }))
                };
                break;

            case 'daily':
                const dailySpikes = detectDailySpikes(transactions);
                results = {
                    method: 'Daily Spike Detection',
                    anomalies: dailySpikes
                };
                break;

            case 'all':
            default:
                results = runAllDetection(transactions);
                results.method = 'All Methods Combined';
                break;
        }

        // Format response
        const response = {
            method: results.method,
            total_transactions_analyzed: transactions.length,
            total_anomalies: results.total_anomalies || results.anomalies?.length || 0,
            anomaly_rate: transactions.length > 0 
                ? parseFloat((((results.total_anomalies || results.anomalies?.length || 0) / transactions.length) * 100).toFixed(2))
                : 0,
            summary: results.summary || null,
            transaction_anomalies: results.transaction_anomalies || results.anomalies || [],
            daily_spikes: results.daily_spikes || (method === 'daily' ? results.anomalies : []),
            category_anomalies: results.category_anomalies || [],
            detection_params: {
                method: method === 'all' ? 'combined' : method,
                threshold: method === 'zscore' ? parseFloat(threshold) : 'auto',
                date_range: {
                    start: startDate || 'all time',
                    end: endDate || 'present'
                }
            }
        };

        res.json({
            success: true,
            data: response
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get category-specific anomalies
const getCategoryAnomalies = async (req, res) => {
    try {
        const categoryName = req.params.category?.toLowerCase();

        if (!categoryName) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const transactions = await Transaction.find({
            user_id: req.user_id,
            category: categoryName,
            type: 'expense'
        }).sort({ date: -1 });

        if (transactions.length === 0) {
            return res.json({
                success: true,
                data: {
                    category: categoryName,
                    total_transactions: 0,
                    message: 'No transactions found in this category',
                    anomalies: []
                }
            });
        }

        // Run category-specific anomaly detection
        const anomalies = detectCategoryAnomalies(transactions);

        // Additional stats
        const amounts = transactions.map(t => t.amount);
        const mean = getMean(transactions);
        const stdDev = getStdDev(transactions);
        const median = getMedian(amounts);
        const maxAmount = Math.max(...amounts);
        const minAmount = Math.min(...amounts);

        res.json({
            success: true,
            data: {
                category: categoryName,
                display_name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
                stats: {
                    total_transactions: transactions.length,
                    average_amount: parseFloat(mean.toFixed(2)),
                    median_amount: parseFloat(median.toFixed(2)),
                    std_deviation: parseFloat(stdDev.toFixed(2)),
                    max_amount: maxAmount,
                    min_amount: minAmount,
                    anomaly_threshold: parseFloat((mean + 2 * stdDev).toFixed(2))
                },
                total_anomalies: anomalies.length,
                anomaly_rate: parseFloat(((anomalies.length / transactions.length) * 100).toFixed(2)),
                anomalies: anomalies.map(a => ({
                    id: a._id,
                    amount: a.amount,
                    description: a.description,
                    date: a.date,
                    anomaly_type: a.anomaly_type || 'category_spike',
                    z_score: a.z_score || parseFloat(
                        (Math.abs(a.amount - mean) / stdDev).toFixed(2)
                    ),
                    deviation_from_mean: parseFloat((a.amount - mean).toFixed(2)),
                    percent_above_average: parseFloat((((a.amount - mean) / mean) * 100).toFixed(2))
                })),
                recent_transactions: transactions.slice(0, 5).map(t => ({
                    id: t._id,
                    amount: t.amount,
                    date: t.date,
                    is_anomaly: anomalies.some(a => a._id?.toString() === t._id.toString()),
                    deviation: parseFloat((t.amount - mean).toFixed(2))
                }))
            }
        });

    } catch (err) {
      
        res.status(500).json({ error: 'Server error' });
    }
};

// Get daily spending spikes
const getDailySpikes = async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense',
            date: { $gte: startDate }
        }).sort({ date: 1 });

        if (transactions.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: 'No transactions in the selected period',
                    spikes: [],
                    daily_data: []
                }
            });
        }

        // Detect daily spikes
        const spikes = detectDailySpikes(transactions);

        // Daily spending breakdown
        const dailyTotals = {};
        transactions.forEach(t => {
            const day = t.date.toISOString().split('T')[0];
            if (!dailyTotals[day]) {
                dailyTotals[day] = { date: day, total: 0, count: 0, transactions: [] };
            }
            dailyTotals[day].total += t.amount;
            dailyTotals[day].count += 1;
            dailyTotals[day].transactions.push(t);
        });

        const dailyArray = Object.values(dailyTotals).sort((a, b) => a.date.localeCompare(b.date));
        
        // Calculate statistics
        const dailyAmounts = dailyArray.map(d => d.total);
        const meanDaily = dailyAmounts.length > 0 
            ? dailyAmounts.reduce((a, b) => a + b, 0) / dailyAmounts.length 
            : 0;
        const maxDaily = Math.max(...dailyAmounts, 0);

        res.json({
            success: true,
            data: {
                period_days: parseInt(days),
                total_days_with_transactions: dailyArray.length,
                average_daily_spending: parseFloat(meanDaily.toFixed(2)),
                max_daily_spending: maxDaily,
                total_spikes: spikes.length,
                spikes: spikes.map(spike => ({
                    date: spike.date,
                    total_spent: spike.total,
                    z_score: spike.z_score,
                    transaction_count: spike.transactions.length,
                    transactions: spike.transactions.map(t => ({
                        id: t._id,
                        amount: t.amount,
                        category: t.category,
                        description: t.description
                    }))
                })),
                daily_data: dailyArray.map(d => ({
                    date: d.date,
                    total: parseFloat(d.total.toFixed(2)),
                    count: d.count,
                    is_spike: spikes.some(s => s.date === d.date),
                    above_average: d.total > meanDaily
                }))
            }
        });

    } catch (err) {
        
        res.status(500).json({ error: 'Server error' });
    }
};

// Get anomaly summary
const getAnomalySummary = async (req, res) => {
    try {
        const transactions = await Transaction.find({
            user_id: req.user_id,
            type: 'expense'
        }).sort({ date: -1 });

        if (transactions.length === 0) {
            return res.json({
                success: true,
                data: {
                    message: 'No transactions found',
                    has_anomalies: false
                }
            });
        }

        // Run all detection methods
        const fullDetection = runAllDetection(transactions);

        // Get recent anomalies (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentTransactions = transactions.filter(t => t.date >= thirtyDaysAgo);
        const recentDetection = runAllDetection(recentTransactions);

        // Category risk assessment
        const categoryRisk = {};
        if (fullDetection.category_anomalies) {
            fullDetection.category_anomalies.forEach(a => {
                const cat = a.category || a._doc?.category;
                if (!categoryRisk[cat]) {
                    categoryRisk[cat] = { count: 0, total_deviation: 0 };
                }
                categoryRisk[cat].count += 1;
                categoryRisk[cat].total_deviation += a.z_score || 0;
            });
        }

        const riskCategories = Object.entries(categoryRisk)
            .map(([category, data]) => ({
                category,
                anomaly_count: data.count,
                risk_level: data.count > 3 ? 'high' : data.count > 1 ? 'medium' : 'low',
                average_deviation: parseFloat((data.total_deviation / data.count).toFixed(2))
            }))
            .sort((a, b) => b.anomaly_count - a.anomaly_count);

        res.json({
            success: true,
            data: {
                total_anomalies: fullDetection.total_anomalies,
                recent_anomalies: recentDetection.total_anomalies,
                anomaly_trend: recentDetection.total_anomalies > fullDetection.total_anomalies * 0.5 
                    ? 'increasing' 
                    : recentDetection.total_anomalies < fullDetection.total_anomalies * 0.2 
                        ? 'decreasing' 
                        : 'stable',
                summary: fullDetection.summary,
                risk_categories: riskCategories.slice(0, 5),
                latest_anomalies: (fullDetection.transaction_anomalies || [])
                    .slice(0, 5)
                    .map(a => ({
                        id: a._id,
                        amount: a.amount,
                        category: a.category,
                        date: a.date,
                        description: a.description,
                        detected_by: a.detected_by || 'zscore_iqr'
                    })),
                alerts: generateAlerts(fullDetection, recentDetection, riskCategories)
            }
        });

    } catch (err) {
       
        res.status(500).json({ error: 'Server error' });
    }
};

// Helper functions
function getMean(transactions) {
    const amounts = transactions.map(t => t.amount);
    return amounts.reduce((a, b) => a + b, 0) / amounts.length;
}

function getStdDev(transactions) {
    const amounts = transactions.map(t => t.amount);
    const mean = getMean(transactions);
    const variance = amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length;
    return Math.sqrt(variance);
}

function getMedian(amounts) {
    const sorted = [...amounts].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 
        ? sorted[mid] 
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Generate alerts based on anomalies
function generateAlerts(fullDetection, recentDetection, riskCategories) {
    const alerts = [];

    if (fullDetection.total_anomalies > 10) {
        alerts.push({
            type: 'warning',
            message: `High number of anomalies detected (${fullDetection.total_anomalies}). Review your spending patterns.`,
            icon: '⚠️'
        });
    }

    if (recentDetection.total_anomalies > fullDetection.total_anomalies * 0.5) {
        alerts.push({
            type: 'danger',
            message: 'Anomaly frequency is increasing recently. Your spending patterns may be changing.',
            icon: '🚨'
        });
    }

    const highRiskCategories = riskCategories.filter(c => c.risk_level === 'high');
    if (highRiskCategories.length > 0) {
        alerts.push({
            type: 'warning',
            message: `High-risk categories: ${highRiskCategories.map(c => c.category).join(', ')}`,
            icon: '🎯'
        });
    }

    if (fullDetection.total_anomalies === 0) {
        alerts.push({
            type: 'success',
            message: 'No anomalies detected! Your spending is consistent.',
            icon: '✅'
        });
    }

    return alerts;
}

module.exports = {
    getAnomalies,
    getCategoryAnomalies,
    getDailySpikes,
    getAnomalySummary
};