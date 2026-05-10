const User = require("../models/User");
const BlacklistedToken = require("../models/BlacklistedToken");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const connectDB = require("../config/connectDB");

// ===============================
// HELPER FUNCTIONS
// ===============================

/**
 * Generate JWT Token
 */
const generateToken = (userId) => {
    return jwt.sign(
        { user_id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

/**
 * Send token response
 */
const sendTokenResponse = (user, statusCode, res) => {
    const token = generateToken(user._id);

    const userResponse = {
        id: user._id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
    };

    res.status(statusCode).json({
        success: true,
        access_token: token,
        expires_in: process.env.JWT_EXPIRE || '7d',
        user: userResponse
    });
};

/**
 * Hash password
 */
const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(12);
    return await bcrypt.hash(password, salt);
};

/**
 * Compare password
 */
const comparePassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
};

// ===============================
// REGISTER USER
// ===============================

/**
 * @desc    Register a new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
    try {
        await connectDB();
        const { username, email, password } = req.body;

        // Validation
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Please provide username, email, and password"
            });
        }

        // Check if user exists
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

        // Validate email format
        const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address"
            });
        }

        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const user = await User.create({
            username,
            email,
            password_hash: hashedPassword
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

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
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

        // Find user
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Compare password
        const isPasswordMatch = await comparePassword(password, user.password_hash);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        sendTokenResponse(user, 200, res);

    } catch (error) {
     
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

/**
 * @desc    Logout user (blacklist token)
 * @route   POST /api/auth/logout
 * @access  Private
 */
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

/**
 * Check if token is blacklisted (for middleware)
 */
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

/**
 * @desc    Get current logged in user profile
 * @route   GET /api/auth/me
 * @access  Private
 */
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
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });

    } catch (error) {
       
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

/**
 * @desc    Update user profile
 * @route   PUT /api/auth/me
 * @access  Private
 */
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

        // Check if username/email already taken
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

        // Update fields
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
                createdAt: user.createdAt
            }
        });

    } catch (error) {
       
        res.status(500).json({
            success: false,
            message: "Failed to update profile",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// CHANGE PASSWORD
// ===============================

/**
 * @desc    Change password (logged in user)
 * @route   PUT /api/auth/password
 * @access  Private
 */
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

        // Hash new password
        user.password_hash = await hashPassword(newPassword);
        await user.save();

        // Blacklist current token to force re-login
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                await BlacklistedToken.addToBlacklist(
                    token,
                    new Date(decoded.exp * 1000),
                    req.user_id
                );
            }
        }

        res.status(200).json({
            success: true,
            message: "Password changed successfully. Please login again."
        });

    } catch (error) {
      
        res.status(500).json({
            success: false,
            message: "Failed to change password",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// FORGOT PASSWORD
// ===============================

/**
 * @desc    Forgot password - send reset token
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res) => {
    try {
        await connectDB();
        const { email } =   req.body;


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

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        user.resetPasswordToken = resetPasswordToken;
        user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour

        await user.save();

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

        // TODO: Send email with resetUrl
        // await sendResetPasswordEmail(user.email, resetUrl);

        res.status(200).json({
            success: true,
            message: "Password reset link sent to your email",
            ...(process.env.NODE_ENV === 'development' && { resetUrl })
        });

    } catch (error) {
       
        res.status(500).json({
            success: false,
            message: "Failed to process request",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// RESET PASSWORD
// ===============================

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
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

        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

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

        // Hash new password
        user.password_hash = await hashPassword(password);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        res.status(200).json({
            success: true,
            message: "Password reset successful. Please login with your new password."
        });

    } catch (error) {
        
        res.status(500).json({
            success: false,
            message: "Failed to reset password",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// DELETE USER ACCOUNT
// ===============================

/**
 * @desc    Delete user account
 * @route   DELETE /api/auth/me
 * @access  Private
 */
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

        // Blacklist current token
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                await BlacklistedToken.addToBlacklist(token, new Date(decoded.exp * 1000), user._id);
            }
        }

        // Delete user permanently
        await User.findByIdAndDelete(req.user_id);

        res.status(200).json({
            success: true,
            message: "Account deleted successfully"
        });

    } catch (error) {
        
        res.status(500).json({
            success: false,
            message: "Failed to delete account",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===============================
// REFRESH TOKEN
// ===============================

/**
 * @desc    Refresh JWT token
 * @route   POST /api/auth/refresh
 * @access  Private
 */
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

        // Generate new token
        const newToken = generateToken(user._id);

        res.status(200).json({
            success: true,
            access_token: newToken,
            expires_in: process.env.JWT_EXPIRE || '7d'
        });

    } catch (error) {
   
        res.status(500).json({
            success: false,
            message: "Failed to refresh token",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    changePassword,
    forgotPassword,
    resetPassword,
    deleteAccount,
    refreshToken
};