const express = require('express');
const authRoutes = require('./auth.routes');
const placesRoutes = require('./places.routes');
const areasRoutes = require('./areas.routes');
const usersRoutes = require('./users.routes');
const aiRoutes = require('./ai.routes');
const mapRoutes = require('./mapRoutes');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.use('/auth', authRoutes);
router.use('/places', placesRoutes);
router.use('/areas', areasRoutes);
router.use('/users', usersRoutes);
router.use('/ai', aiRoutes);
router.use('/map', mapRoutes);

module.exports = router;
