const mongoose = require('mongoose');

const interactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    place: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    type: { type: String, enum: ['view', 'favorite', 'search', 'select'], required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Interaction', interactionSchema);
