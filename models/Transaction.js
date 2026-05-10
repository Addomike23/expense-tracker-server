const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01
    },
    category: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    date: {
        type: Date,
        default: Date.now,
        required: true
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        default: 'expense',
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'mobile_money', 'other'],
        default: 'cash'
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringFrequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly', null],
        default: null
    },
    isAnomaly: {
        type: Boolean,
        default: false
    },
    anomalyScore: {
        type: Number,
        default: 0
    },
    location: {
        type: String,
        trim: true,
        default: ''
    },
    notes: {
        type: String,
        trim: true,
        default: ''
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Transaction', transactionSchema);