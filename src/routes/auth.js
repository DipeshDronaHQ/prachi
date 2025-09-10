const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

const router = express.Router();

// Mock Google OAuth for development - replace with actual implementation
router.get('/google', (req, res) => {
  // In production, this would redirect to Google OAuth
  // For now, return instructions for testing
  res.json({
    success: true,
    message: 'Google OAuth endpoint - implement with passport-google-oauth20',
    data: {
      instructions: 'This endpoint should redirect to Google OAuth. For testing, use POST /auth/mock-login'
    }
  });
});

router.get('/google/callback', (req, res) => {
  // In production, this would handle Google OAuth callback
  res.json({
    success: true,
    message: 'Google OAuth callback endpoint - implement with passport-google-oauth20',
    data: null
  });
});

// Mock login for development/testing
router.post('/mock-login', async (req, res) => {
  try {
    const { email, name, googleId } = req.body;
    
    if (!email || !name || !googleId) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and googleId are required',
        error: {
          code: 'MISSING_FIELDS'
        },
        data: null
      });
    }

    // Find or create user
    let user = await User.findOne({ email });
    
    if (!user) {
      user = await User.create({
        googleId,
        email,
        name,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`
      });
    } else {
      // Update user info if needed
      user.name = name;
      user.googleId = googleId;
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          avatar: user.avatar
        }
      }
    });
  } catch (error) {
    console.error('Mock login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: {
        code: 'LOGIN_ERROR',
        details: error.message
      },
      data: null
    });
  }
});

// Get current user info
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'User information retrieved',
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          name: req.user.name,
          avatar: req.user.avatar,
          createdAt: req.user.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information',
      error: {
        code: 'GET_USER_ERROR'
      },
      data: null
    });
  }
});

module.exports = router;