const mongoose = require("mongoose");

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL environment variable is not defined");
  }

  if (!cached.promise) {
    const options = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      family: 4,
    };

    cached.promise = mongoose
      .connect(process.env.MONGODB_URL, options)
      .then(async (mongoose) => {
        console.log('✅ MongoDB connected successfully');

        // Auto-drop old phone_1 index if it exists
        try {
          const db = mongoose.connection.db;
          const collections = await db.listCollections({ name: 'users' }).toArray();
          
          if (collections.length > 0) {
            const indexes = await db.collection('users').indexes();
            const phoneIndex = indexes.find(idx => idx.name === 'phone_1');
            
            if (phoneIndex) {
              await db.collection('users').dropIndex('phone_1');
              console.log('✅ Dropped old phone_1 index');
            } else {
              console.log('ℹ️ phone_1 index not found (already removed)');
            }
          }
        } catch (err) {
          if (err.code === 27) {
            console.log('ℹ️ phone_1 index already dropped');
          } else {
            console.log('⚠️ Index check warning:', err.message);
          }
        }

        return mongoose;
      })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    throw error;
  }
}

module.exports = connectDB;