const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { uploadShopPaymentQr } = require('../middleware/shopPaymentUpload');
const {
  saveShopProfile,
  getShopProfile,
  createShopItem,
  getMyShopItems,
  getShopItemsForOwners,
  createShopOrder,
  getShopOrders,
  markShopOrderPaymentSubmitted,
  confirmShopOrderPayment,
  updateShopOrderFulfillment,
} = require('../controllers/shopController');

const router = express.Router();

router.get('/shop/profile', protect, authorize('shop_keeper'), getShopProfile);
router.post('/shop/profile', protect, authorize('shop_keeper'), uploadShopPaymentQr, saveShopProfile);
router.post('/shop/items', protect, authorize('shop_keeper'), createShopItem);
router.get('/shop/items/mine', protect, authorize('shop_keeper'), getMyShopItems);
router.get('/shop/items', protect, authorize('arena_owner'), getShopItemsForOwners);
router.post('/shop/orders', protect, authorize('arena_owner'), createShopOrder);
router.get('/shop/orders', protect, authorize('arena_owner', 'shop_keeper'), getShopOrders);
router.put('/shop/orders/:id/payment-submitted', protect, authorize('arena_owner'), markShopOrderPaymentSubmitted);
router.put('/shop/orders/:id/confirm-payment', protect, authorize('shop_keeper'), confirmShopOrderPayment);
router.put('/shop/orders/:id/fulfillment', protect, authorize('shop_keeper'), updateShopOrderFulfillment);

module.exports = router;
