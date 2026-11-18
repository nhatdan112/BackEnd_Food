const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  updateProfile,
  updatePreferences,
  toggleFavorite,
  getSearchHistory,
  addSearchHistory,
  clearSearchHistory,
  removeSearchHistoryItem,
  getInteractionHistory,
  addInteraction,
} = require('../controllers/userController');

const router = express.Router();
router.use(requireAuth);

router.patch('/me', updateProfile);
router.patch('/me/preferences', updatePreferences);
router.post('/me/favorites/:placeId', toggleFavorite);

router.get('/me/history/search', getSearchHistory);
router.post('/me/history/search', addSearchHistory);
router.delete('/me/history/search', clearSearchHistory);
router.delete('/me/history/search/:id', removeSearchHistoryItem);

router.get('/me/history/interactions', getInteractionHistory);
router.post('/me/history/interactions', addInteraction);

module.exports = router;
