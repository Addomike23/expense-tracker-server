const mongoose = require('mongoose');
const connectDB = require('../config/connectDB');

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: [true, 'Username is required'], 
        unique: true,
        minlength: [3, 'Username must be at least 3 characters']
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'], 
        unique: true, 
        lowercase: true,
        trim: true
    },
    password_hash: { 
        type: String, 
        required: [true, 'Password is required']
    },
      // Currency preference
    currency: {
        type: String,
        default: 'USD',
        enum: ['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'JPY', 'CAD', 'AUD', 'INR', 'CNY']
    },
    currencySymbol: {
        type: String,
        default: '$'
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    lastLogin: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date
}, { 
    timestamps: true 
});

// Auto-connect before any query
userSchema.pre('find', async function() {
    await connectDB();
});

userSchema.pre('findOne', async function() {
    await connectDB();
});

userSchema.pre('save', async function() {
    await connectDB();
});

module.exports = mongoose.model('User', userSchema);