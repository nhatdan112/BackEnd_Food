
const express = require('express');

const authRoutes = require('./auth.routes');
const placesRoutes = require('./places.routes');
const areasRoutes = require('./areas.routes');
const usersRoutes = require('./users.routes');
const aiRoutes = require('./ai.routes');
const mapRoutes = require('./mapRoutes');

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    service: 'FoodFinder API',
    time: new Date().toISOString(),
  });
});

// Authentication
router.use('/auth', authRoutes);

// Places
router.use('/places', placesRoutes);

// Areas
router.use('/areas', areasRoutes);

// Users
router.use('/users', usersRoutes);

// AI
router.use('/ai', aiRoutes);

// Map
router.use('/map', mapRoutes);

module.exports = router;
