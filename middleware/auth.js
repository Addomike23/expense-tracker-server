const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isTokenBlacklisted } = require('../controller/authController');

const protect = async (req, res, next) => {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized, no token'
        });
    }

    // Check if token is blacklisted
    const blacklisted = await isTokenBlacklisted(token);
    if (blacklisted) {
        return res.status(401).json({
            success: false,
            message: 'Token has been invalidated. Please login again.'
        });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find user
        req.user = await User.findById(decoded.user_id).select('-password_hash');

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        // Set user_id for controller use
        req.user_id = req.user._id;

        next();
    } catch (error) {
        console.error('Auth error:', error.message);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Not authorized, token failed'
        });
    }
};

module.exports = protect;