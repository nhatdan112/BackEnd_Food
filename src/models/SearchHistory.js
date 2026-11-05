const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    keyword: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SearchHistory', searchHistorySchema);
