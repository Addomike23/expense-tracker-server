const express = require('express');
const authRouter = express.Router();
const { protect, admin } = require('../middleware/auth');
const {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  deleteAccount,
  refreshToken,
  getAllUsers,
  updateUserRole,
  deleteUser
} = require('../controller/authController');

// Public routes
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/reset-password/:token', resetPassword);

// Private routes (require authentication)
authRouter.post('/logout', protect, logout);
authRouter.get('/profile', protect, getProfile);
authRouter.put('/profile', protect, updateProfile);
authRouter.put('/change-password', protect, changePassword);
authRouter.delete('/profile', protect, deleteAccount);
authRouter.post('/refresh-token', protect, refreshToken);

// Admin only routes
authRouter.get('/users', protect, admin, getAllUsers);
authRouter.put('/users/:id/role', protect, admin, updateUserRole);
authRouter.delete('/users/:id', protect, admin, deleteUser);

module.exports = authRouter;