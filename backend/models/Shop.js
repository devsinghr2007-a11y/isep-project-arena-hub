const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    upiId: { type: String, trim: true },
    paymentLink: { type: String, trim: true },
    paymentQrUrl: { type: String, trim: true },
    paymentInstructions: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shop', shopSchema);
