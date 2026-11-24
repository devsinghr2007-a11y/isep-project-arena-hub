const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    arena: { type: mongoose.Schema.Types.ObjectId, ref: 'Arena', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true },
  },
  { timestamps: true }
);

// A customer can leave one review for each arena. The controller also checks
// this so it can return a clear message before MongoDB enforces the rule.
reviewSchema.index({ user: 1, arena: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
