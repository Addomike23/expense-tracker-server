const express = require('express');
const authrouter = express.Router();
const { 
    register, 
    login, 
    logout,
    getMe, 
    updateProfile, 
    changePassword,
    forgotPassword,
    resetPassword,
    deleteAccount,
    refreshToken,
    updateCurrency,     // ← New
    getCurrencies       // ← New
} = require('../controller/authController');
const protect = require('../middleware/auth');

// Public routes
authrouter.post('/register', register);
authrouter.post('/login', login);
authrouter.post('/forgot-password', forgotPassword);
authrouter.post('/reset-password/:token', resetPassword);
authrouter.get('/currencies', getCurrencies);           // ← Public - anyone can see available currencies

// Protected routes
authrouter.get('/me', protect, getMe);
authrouter.put('/me', protect, updateProfile);
authrouter.put('/password', protect, changePassword);
authrouter.put('/currency', protect, updateCurrency);   // ← Protected - update user's currency
authrouter.post('/logout', protect, logout);
authrouter.post('/refresh', protect, refreshToken);
authrouter.delete('/me', protect, deleteAccount);

module.exports = authrouter;