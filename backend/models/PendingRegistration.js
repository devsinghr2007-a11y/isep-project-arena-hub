const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['customer', 'arena_owner', 'shop_keeper'],
      default: 'customer',
    },
    emailOtpHash: { type: String, required: true },
    emailAttempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
