const User = require("../models/User");
const BlacklistedToken = require("../models/BlacklistedToken");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const connectDB = require("../config/connectDB");
const { getAvailableCurrencies, currencies } = require("../utils/currencyConfig");

// ===============================
// HELPER FUNCTIONS
// ===============================

const generateToken = (userId) => {
    return jwt.sign(
        { user_id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

const sendTokenResponse = (user, statusCode, res) => {
    const token = generateToken(user._id);

    const userResponse = {
        id: user._id,
        username: user.username,
        email: user.email,
        currency: user.currency || 'USD',
        currencySymbol: user.currencySymbol || '$',
        createdAt: user.createdAt
    };

    res.status(statusCode).json({
        success: true,
        access_token: token,
        expires_in: process.env.JWT_EXPIRE || '7d',
        user: userResponse
    });
};

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(password, salt);
};

const comparePassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
};

// ===============================
// REGISTER USER
// ===============================
const register = async (req, res) => {
    try {
        await connectDB();
        const { username, email, password, currency } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide username, email, and password"
            });
        }

        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: existingUser.username === username
                    ? "Username already registered"
                    : "Email already registered"
            });
        }

        const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        // Validate currency if provided
        const userCurrency = currency || 'USD';
        const validCurrencies = Object.keys(currencies);
        if (!validCurrencies.includes(userCurrency)) {
            return res.status(400).json({
                success: false,
                message: "Invalid currency code"
            });
        }

        const hashedPassword = await hashPassword(password);
        const currencyConfig = currencies[userCurrency];

        const user = await User.create({
            username,
            email,
            password_hash: hashedPassword,
            currency: userCurrency,
            currencySymbol: currencyConfig.symbol
        });

        sendTokenResponse(user, 201, res);

    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                message: messages[0]
            });
        }

        console.error("Register error:", error);
        res.status(500).json({
            success: false,
            message: "Registration failed",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// LOGIN USER
// ===============================
const login = async (req, res) => {
    try {
        await connectDB();
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide username and password"
            });
        }

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const isPasswordMatch = await comparePassword(password, user.password_hash);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        sendTokenResponse(user, 200, res);

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Login failed",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// LOGOUT USER
// ===============================
const logout = async (req, res) => {
    try {
        await connectDB();
        const token = req.headers.authorization?.split(' ')[1];

        if (token) {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                const expiresAt = new Date(decoded.exp * 1000);
                await BlacklistedToken.addToBlacklist(token, expiresAt, req.user_id);
            }
        }

        res.status(200).json({
            success: true,
            message: "Logged out successfully"
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(200).json({
                success: true,
                message: "Already logged out"
            });
        }

        res.status(500).json({
            success: false,
            message: "Logout failed",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const isTokenBlacklisted = async (token) => {
    try {
        return await BlacklistedToken.isBlacklisted(token);
    } catch (error) {
        return false;
    }
};

// ===============================
// GET CURRENT USER PROFILE
// ===============================
const getMe = async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.user_id)
            .select('-password_hash')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                currency: user.currency || 'USD',
                currencySymbol: user.currencySymbol || '$',
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
        console.error("Get me error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch profile",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// UPDATE USER PROFILE
// ===============================
const updateProfile = async (req, res) => {
    try {
        await connectDB();
        const { username, email } = req.body;

        const user = await User.findById(req.user_id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        if (username || email) {
            const existingUser = await User.findOne({
                _id: { $ne: req.user_id },
                $or: [
                    ...(username ? [{ username }] : []),
                    ...(email ? [{ email }] : [])
                ]
            });

            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: existingUser.username === username
                        ? "Username already in use"
                        : "Email already in use"
                });
            }
        }

        if (username) user.username = username;
        if (email) user.email = email;

        await user.save();

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                currency: user.currency,
                currencySymbol: user.currencySymbol,
                createdAt: user.createdAt
            }
        });

    } catch (error) {
        console.error("Update profile error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update profile",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// UPDATE CURRENCY PREFERENCE
// ===============================
const updateCurrency = async (req, res) => {
    try {
        await connectDB();
        const { currency } = req.body;

        const validCurrencies = Object.keys(currencies);
        if (!validCurrencies.includes(currency)) {
            return res.status(400).json({
                success: false,
                message: "Invalid currency code"
            });
        }

        const currencyConfig = currencies[currency];

        const user = await User.findByIdAndUpdate(
            req.user_id,
            {
                currency: currency,
                currencySymbol: currencyConfig.symbol
            },
            { new: true }
        ).select('-password_hash');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            message: `Currency updated to ${currencyConfig.name}`,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                currency: user.currency,
                currencySymbol: user.currencySymbol
            }
        });

    } catch (error) {
        console.error("Update currency error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update currency",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// GET AVAILABLE CURRENCIES
// ===============================
const getCurrencies = async (req, res) => {
    try {
        const availableCurrencies = getAvailableCurrencies();
        res.status(200).json({
            success: true,
            data: availableCurrencies
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch currencies"
        });
    }
};

// ===============================
// CHANGE PASSWORD
// ===============================
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        await connectDB();

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Please provide current and new password"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters"
            });
        }

        const user = await User.findById(req.user_id);
        const isPasswordMatch = await comparePassword(currentPassword, user.password_hash);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: "Current password is incorrect"
            });
        }

        user.password_hash = await hashPassword(newPassword);
        await user.save();

        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                await BlacklistedToken.addToBlacklist(token, new Date(decoded.exp * 1000), req.user_id);
            }
        }

        res.status(200).json({
            success: true,
            message: "Password changed successfully. Please login again."
        });

    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to change password"
        });
    }
};

// ===============================
// FORGOT PASSWORD
// ===============================
const forgotPassword = async (req, res) => {
    try {
        await connectDB();
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Please provide email address"
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.status(200).json({
                success: true,
                message: "If an account exists with that email, you will receive a password reset link"
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.resetPasswordToken = resetPasswordToken;
        user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;
        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        res.status(200).json({
            success: true,
            message: "Password reset link sent to your email",
            ...(process.env.NODE_ENV === 'development' && { resetUrl })
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process request"
        });
    }
};

// ===============================
// RESET PASSWORD
// ===============================
const resetPassword = async (req, res) => {
    try {
        await connectDB();
        const { token } = req.params;
        const { password } = req.body;

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token"
            });
        }

        user.password_hash = await hashPassword(password);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: "Password reset successful. Please login with your new password."
        });

    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reset password"
        });
    }
};

// ===============================
// DELETE USER ACCOUNT
// ===============================
const deleteAccount = async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.user_id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                await BlacklistedToken.addToBlacklist(token, new Date(decoded.exp * 1000), user._id);
            }
        }

        await User.findByIdAndDelete(req.user_id);

        res.status(200).json({
            success: true,
            message: "Account deleted successfully"
        });

    } catch (error) {
        console.error("Delete account error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete account"
        });
    }
};

// ===============================
// REFRESH TOKEN
// ===============================
const refreshToken = async (req, res) => {
    try {
        await connectDB();
        const user = await User.findById(req.user_id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const newToken = generateToken(user._id);

        res.status(200).json({
            success: true,
            access_token: newToken,
            expires_in: process.env.JWT_EXPIRE || '7d'
        });

    } catch (error) {
        console.error("Refresh token error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to refresh token"
        });
    }
};

module.exports = {
    register,
    login,
    logout,
    isTokenBlacklisted,
    getMe,
    updateProfile,
    updateCurrency,
    getCurrencies,
    changePassword,
    forgotPassword,
    resetPassword,
    deleteAccount,
    refreshToken
};