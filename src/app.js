require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import configuration
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const seedData = require('./utils/seedData');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');

const app = express();

// Connect to databases and seed data
const initializeApp = async () => {
  await connectDB();
  await connectRedis();
  await seedData();
};

initializeApp().catch(console.error);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    error: {
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'StudySync API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'StudySync API - Custom Study Groups with Live Leaderboards',
    data: {
      version: '1.0.0',
      endpoints: {
        auth: {
          'POST /auth/mock-login': 'Mock login for testing (email, name, googleId required)',
          'GET /auth/me': 'Get current user info (requires auth)'
        },
        groups: {
          'GET /api/groups': 'List user groups',
          'POST /api/groups': 'Create study group',
          'GET /api/groups/:id': 'Get group details',
          'POST /api/groups/:id/members': 'Add member to group',
          'POST /api/groups/:id/goals': 'Create goal for group',
          'GET /api/groups/:id/goals/active': 'Get active goal',
          'POST /api/groups/:id/activities': 'Record activity',
          'GET /api/groups/:id/leaderboard': 'Get leaderboard',
          'GET /api/groups/:id/progress': 'Get progress'
        }
      },
      documentation: 'See README.md for detailed API documentation'
    }
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/api/groups', groupRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    error: {
      code: 'ENDPOINT_NOT_FOUND'
    },
    data: {
      suggestion: 'Visit /api for available endpoints'
    }
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 StudySync API Server is running on port ${PORT}`);
  console.log(`📖 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API Documentation: http://localhost:${PORT}/api`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
});