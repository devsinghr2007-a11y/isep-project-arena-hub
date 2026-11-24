const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createOrder,
  verifyPayment,
  cashfreeWebhook,
  createRazorpayOrder,
  verifyRazorpayPayment,
} = require('../controllers/paymentController');

// Cashfree routes
router.post('/payment/order', protect, createOrder);
router.post('/payment/verify', protect, verifyPayment);
router.post('/payment/cashfree/webhook', cashfreeWebhook);

// Razorpay routes
router.post('/payment/razorpay/order', protect, createRazorpayOrder);
router.post('/payment/razorpay/verify', protect, verifyRazorpayPayment);

module.exports = router;
