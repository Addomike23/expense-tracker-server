const mongoose = require('mongoose');

const blacklistedTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // MongoDB TTL index - auto delete after expiry
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-cleanup expired tokens (MongoDB TTL)
blacklistedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Add method to check if token exists
blacklistedTokenSchema.statics.isBlacklisted = async function(token) {
  const result = await this.findOne({ token });
  return !!result;
};

// Add method to add token (with duplicate handling)
blacklistedTokenSchema.statics.addToBlacklist = async function(token, expiresAt, userId) {
  try {
    // Use updateOne with upsert to avoid duplicate errors
    const result = await this.updateOne(
      { token }, // filter
      { token, expiresAt, userId }, // data
      { upsert: true } // insert if not exists
    );
    return result;
  } catch (error) {
    // If duplicate key error, it already exists
    if (error.code === 11000) {
      console.log('Token already blacklisted:', token.substring(0, 50) + '...');
      return { alreadyExists: true };
    }
    throw error;
  }
};

module.exports = mongoose.model('BlacklistedToken', blacklistedTokenSchema);