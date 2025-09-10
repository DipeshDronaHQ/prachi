const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.log('ℹ️  Running without MongoDB - some features may be limited');
    // Don't exit the process, allow the app to run for demonstration
    // In production, you would want to exit: process.exit(1);
  }
};

module.exports = connectDB;