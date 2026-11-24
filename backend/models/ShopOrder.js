const mongoose = require('mongoose');

const shopOrderSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    shopItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopItem', required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deliveryArenaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Arena', required: true },
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: {
      type: String,
      enum: ['upi', 'cash_on_delivery'],
      default: 'upi',
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'submitted', 'confirmed', 'cash_on_delivery', 'paid_on_delivery', 'cancelled'],
      default: 'pending',
    },
    fulfillmentStatus: {
      type: String,
      enum: ['placed', 'processing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'placed',
    },
    estimatedDeliveryDate: { type: Date },
    statusTimeline: [
      {
        status: {
          type: String,
          enum: ['placed', 'processing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'],
          required: true,
        },
        at: { type: Date, default: Date.now },
      },
    ],
    // A cancellation returns the reserved units once, without allowing a
    // repeat update to put extra stock back into the catalogue.
    stockRestored: { type: Boolean, default: false },
    // Snapshot means the buyer can still pay using the agreed details even if
    // the seller later updates their shop profile.
    paymentSnapshot: {
      upiId: { type: String },
      paymentLink: { type: String },
      paymentQrUrl: { type: String },
      paymentInstructions: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShopOrder', shopOrderSchema);
