const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    budget: {
        type: Number,
        required: true,
        min: 0
    },
    spent: {
        type: Number,
        default: 0,
        min: 0
    },
    remaining: {
        type: Number,
        default: function() {
            return this.budget;
        }
    },
    percentage: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly'],
        default: 'monthly'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        default: function() {
            const date = new Date();
            date.setMonth(date.getMonth() + 1);
            return date;
        }
    },
    alertThreshold: {
        type: Number,
        default: 80, // Alert when 80% of budget is spent
        min: 1,
        max: 100
    },
    isActive: {
        type: Boolean,
        default: true
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

// Compound index: One budget per category per user
budgetSchema.index({ user_id: 1, category: 1 }, { unique: true });

// // Pre-save middleware to calculate remaining and percentage
// budgetSchema.pre('save', function(next) {
//     this.remaining = Math.max(0, this.budget - this.spent);
//     this.percentage = this.budget > 0 ? Math.min(100, (this.spent / this.budget) * 100) : 0;
//     next();
// });

// Instance method: Check if budget is exceeded
budgetSchema.methods.isExceeded = function() {
    return this.spent > this.budget;
};

// Instance method: Check if budget needs alert
budgetSchema.methods.needsAlert = function() {
    return this.percentage >= this.alertThreshold && !this.isExceeded();
};

// Instance method: Get budget status
budgetSchema.methods.getStatus = function() {
    if (this.isExceeded()) return 'exceeded';
    if (this.needsAlert()) return 'warning';
    return 'good';
};

// Static method: Get all budgets for a user with calculated fields
budgetSchema.statics.getUserBudgets = async function(userId) {
    return this.aggregate([
        { $match: { user_id: mongoose.Types.ObjectId(userId), isActive: true } },
        {
            $addFields: {
                remaining: { $subtract: ['$budget', '$spent'] },
                percentage: {
                    $cond: [
                        { $gt: ['$budget', 0] },
                        { $multiply: [{ $divide: ['$spent', '$budget'] }, 100] },
                        0
                    ]
                }
            }
        },
        {
            $addFields: {
                status: {
                    $cond: [
                        { $gt: ['$spent', '$budget'] },
                        'exceeded',
                        {
                            $cond: [
                                { $gte: ['$percentage', '$alertThreshold'] },
                                'warning',
                                'good'
                            ]
                        }
                    ]
                }
            }
        }
    ]);
};

// Static method: Update spent amount for a category
budgetSchema.statics.updateSpent = async function(userId, category, amount) {
    return this.findOneAndUpdate(
        { user_id: userId, category, isActive: true },
        { $inc: { spent: amount } },
        { new: true }
    );
};

// Static method: Reset all budgets for a new period
budgetSchema.statics.resetBudgets = async function(userId) {
    const date = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    return this.updateMany(
        { user_id: userId, isActive: true },
        {
            $set: {
                spent: 0,
                remaining: 0, // Will be recalculated in pre-save
                percentage: 0,
                startDate: date,
                endDate: endDate
            }
        }
    );
};

module.exports = mongoose.model('Budget', budgetSchema);