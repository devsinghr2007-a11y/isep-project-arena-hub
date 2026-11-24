const Arena = require('../models/Arena');
const Shop = require('../models/Shop');
const ShopItem = require('../models/ShopItem');
const ShopOrder = require('../models/ShopOrder');

const paymentMethods = ['upi', 'cash_on_delivery'];
const fulfillmentStatuses = ['placed', 'processing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'];
const fulfillmentTransitions = {
  placed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

const validPaymentLink = (value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch (_error) {
    return false;
  }
};

const getOwnedShop = (userId) => Shop.findOne({ ownerId: userId });

// POST /shop/profile  (shop_keeper)
const saveShopProfile = async (req, res) => {
  try {
    const { name, address, city, phone, upiId, paymentLink, paymentInstructions } = req.body;
    if (!name?.trim() || !address?.trim() || !city?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: 'Shop name, address, city, and phone are required.' });
    }
    if (!validPaymentLink(paymentLink)) {
      return res.status(400).json({ message: 'Payment link must be a valid HTTPS URL.' });
    }

    const fields = {
      ownerId: req.user.id,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      phone: phone.trim(),
      upiId: upiId?.trim() || undefined,
      paymentLink: paymentLink?.trim() || undefined,
      paymentInstructions: paymentInstructions?.trim() || undefined,
    };
    if (req.file) fields.paymentQrUrl = `/uploads/shop-payments/${req.file.filename}`;

    const shop = await Shop.findOneAndUpdate(
      { ownerId: req.user.id },
      { $set: fields },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json(shop);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to save shop profile.', error: err.message });
  }
};

// GET /shop/profile  (shop_keeper)
const getShopProfile = async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.id);
    return res.json(shop);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch shop profile.', error: err.message });
  }
};

// POST /shop/items  (shop_keeper)
const createShopItem = async (req, res) => {
  try {
    const { name, sport, description, price, quantity } = req.body;
    const numericPrice = Number(price);
    const numericQuantity = Number(quantity);
    if (!name?.trim() || !sport?.trim() || !Number.isFinite(numericPrice) || numericPrice < 0 || !Number.isInteger(numericQuantity) || numericQuantity < 0) {
      return res.status(400).json({ message: 'Name, sport, price, and a whole-number quantity are required.' });
    }
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(400).json({ message: 'Save your shop details before adding equipment.' });

    const item = await ShopItem.create({
      shopId: shop._id,
      name: name.trim(),
      sport: sport.trim(),
      description: description?.trim(),
      price: numericPrice,
      quantity: numericQuantity,
    });
    return res.status(201).json(item);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to add shop equipment.', error: err.message });
  }
};

// GET /shop/items/mine  (shop_keeper)
const getMyShopItems = async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.json([]);
    return res.json(await ShopItem.find({ shopId: shop._id }).sort({ createdAt: -1 }));
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch shop equipment.', error: err.message });
  }
};

// GET /shop/items?city=  (arena_owner only)
const getShopItemsForOwners = async (req, res) => {
  try {
    const filter = {};
    if (req.query.city?.trim()) {
      const shops = await Shop.find({ city: new RegExp(req.query.city.trim(), 'i') }).select('_id');
      filter.shopId = { $in: shops.map((shop) => shop._id) };
    }
    const items = await ShopItem.find(filter)
      // This route is limited to arena owners, so they can see the current
      // UPI QR/details before deciding to place an equipment order.
      .populate('shopId', 'name address city phone upiId paymentLink paymentQrUrl paymentInstructions')
      .sort({ createdAt: -1 });
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch shop equipment.', error: err.message });
  }
};

// POST /shop/orders  (arena_owner) — atomically reserves/decrements shop stock
const createShopOrder = async (req, res) => {
  try {
    const { shopItemId, quantity = 1, deliveryArenaId, paymentMethod } = req.body;
    const requestedQuantity = Number(quantity);
    if (!shopItemId || !deliveryArenaId || !Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      return res.status(400).json({ message: 'Equipment, delivery arena, and a positive whole-number quantity are required.' });
    }
    if (!paymentMethods.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Choose UPI or cash on delivery.' });
    }

    const deliveryArena = await Arena.findOne({ _id: deliveryArenaId, ownerId: req.user.id });
    if (!deliveryArena) return res.status(403).json({ message: 'Choose one of your own arenas for this order.' });

    // Reserve stock before writing the order. This makes the available count
    // correct even when two arena owners order the last item at once.
    const item = await ShopItem.findOneAndUpdate(
      { _id: shopItemId, quantity: { $gte: requestedQuantity } },
      { $inc: { quantity: -requestedQuantity } },
      { new: true }
    );
    if (!item) return res.status(409).json({ message: 'This item is sold out or does not have enough stock.' });

    try {
      const shop = await Shop.findById(item.shopId);
      if (!shop) throw new Error('Shop not found.');
      if (paymentMethod === 'upi' && !shop.upiId && !shop.paymentLink && !shop.paymentQrUrl) {
        const error = new Error('This shop has not added UPI payment details. Choose cash on delivery or ask the shopkeeper to add UPI details.');
        error.statusCode = 409;
        throw error;
      }
      const order = await ShopOrder.create({
        shopId: shop._id,
        shopItemId: item._id,
        buyerId: req.user.id,
        deliveryArenaId: deliveryArena._id,
        itemName: item.name,
        quantity: requestedQuantity,
        unitPrice: item.price,
        amount: item.price * requestedQuantity,
        paymentMethod,
        paymentStatus: paymentMethod === 'cash_on_delivery' ? 'cash_on_delivery' : 'pending',
        fulfillmentStatus: 'placed',
        statusTimeline: [{ status: 'placed' }],
        paymentSnapshot: {
          upiId: shop.upiId,
          paymentLink: shop.paymentLink,
          paymentQrUrl: shop.paymentQrUrl,
          paymentInstructions: shop.paymentInstructions,
        },
      });
      return res.status(201).json({ order, shop: { name: shop.name, phone: shop.phone, city: shop.city } });
    } catch (error) {
      await ShopItem.findByIdAndUpdate(shopItemId, { $inc: { quantity: requestedQuantity } });
      throw error;
    }
  } catch (err) {
    return res.status(500).json({ message: err.statusCode ? err.message : 'Unable to create equipment order.', ...(err.statusCode ? {} : { error: err.message }) });
  }
};

// GET /shop/orders — seller sees arena-owner details only; buyer sees own orders only
const getShopOrders = async (req, res) => {
  try {
    if (req.user.role === 'shop_keeper') {
      const shop = await getOwnedShop(req.user.id);
      if (!shop) return res.json([]);
      const orders = await ShopOrder.find({ shopId: shop._id })
        .populate('buyerId', 'name email phone')
        .populate('deliveryArenaId', 'name location')
        .sort({ createdAt: -1 });
      return res.json(orders);
    }

    const orders = await ShopOrder.find({ buyerId: req.user.id })
      // Use the shop's current payment details. When a shopkeeper replaces a
      // QR code, an owner sees the replacement rather than an old order copy.
      .populate('shopId', 'name address city phone upiId paymentLink paymentQrUrl paymentInstructions')
      .populate('deliveryArenaId', 'name location')
      .sort({ createdAt: -1 });
    return res.json(orders);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch shop orders.', error: err.message });
  }
};

// PUT /shop/orders/:id/payment-submitted  (arena_owner)
const markShopOrderPaymentSubmitted = async (req, res) => {
  try {
    const order = await ShopOrder.findOneAndUpdate(
      {
        _id: req.params.id,
        buyerId: req.user.id,
        paymentStatus: 'pending',
        $or: [{ paymentMethod: 'upi' }, { paymentMethod: { $exists: false } }],
      },
      { $set: { paymentStatus: 'submitted' } },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'UPI payment awaiting submission was not found.' });
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to update payment status.', error: err.message });
  }
};

// PUT /shop/orders/:id/confirm-payment  (shop_keeper)
const confirmShopOrderPayment = async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(400).json({ message: 'Save your shop profile first.' });
    const order = await ShopOrder.findOneAndUpdate(
      {
        _id: req.params.id,
        shopId: shop._id,
        paymentStatus: 'submitted',
        $or: [{ paymentMethod: 'upi' }, { paymentMethod: { $exists: false } }],
      },
      { $set: { paymentStatus: 'confirmed' } },
      { new: true }
    );
    if (!order) return res.status(404).json({ message: 'Submitted order not found.' });
    return res.json(order);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to confirm payment.', error: err.message });
  }
};

// PUT /shop/orders/:id/fulfillment  (shop_keeper)
// The seller supplies the delivery estimate and moves the order through its
// delivery states. Only that seller's own orders can be changed.
const updateShopOrderFulfillment = async (req, res) => {
  try {
    const shop = await getOwnedShop(req.user.id);
    if (!shop) return res.status(400).json({ message: 'Save your shop profile first.' });

    const order = await ShopOrder.findOne({ _id: req.params.id, shopId: shop._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const nextStatus = req.body.fulfillmentStatus || order.fulfillmentStatus || 'placed';
    if (!fulfillmentStatuses.includes(nextStatus)) {
      return res.status(400).json({ message: 'Choose a valid delivery status.' });
    }

    const currentStatus = order.fulfillmentStatus || 'placed';
    if (nextStatus !== currentStatus && !fulfillmentTransitions[currentStatus].includes(nextStatus)) {
      return res.status(409).json({ message: `This order cannot move from ${currentStatus.replaceAll('_', ' ')} to ${nextStatus.replaceAll('_', ' ')}.` });
    }
    if (order.paymentMethod === 'upi' && order.paymentStatus !== 'confirmed' && nextStatus !== 'cancelled' && nextStatus !== 'placed') {
      return res.status(409).json({ message: 'Confirm the UPI payment before preparing this order.' });
    }

    let estimatedDeliveryDate = order.estimatedDeliveryDate;
    if (Object.prototype.hasOwnProperty.call(req.body, 'estimatedDeliveryDate')) {
      if (!req.body.estimatedDeliveryDate) {
        estimatedDeliveryDate = undefined;
      } else {
        const parsedDate = new Date(req.body.estimatedDeliveryDate);
        if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'Enter a valid expected delivery date.' });
        parsedDate.setHours(23, 59, 59, 999);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedDate < today) return res.status(400).json({ message: 'Expected delivery cannot be in the past.' });
        estimatedDeliveryDate = parsedDate;
      }
    }
    if (nextStatus !== 'placed' && nextStatus !== 'cancelled' && !estimatedDeliveryDate) {
      return res.status(400).json({ message: 'Set the expected delivery date before preparing this order.' });
    }

    const update = {
      $set: { fulfillmentStatus: nextStatus, estimatedDeliveryDate },
    };
    if (nextStatus !== currentStatus) update.$push = { statusTimeline: { status: nextStatus } };
    if (nextStatus === 'delivered' && order.paymentMethod === 'cash_on_delivery') {
      update.$set.paymentStatus = 'paid_on_delivery';
    }
    if (nextStatus === 'cancelled') {
      update.$set.paymentStatus = 'cancelled';
      if (!order.stockRestored) update.$set.stockRestored = true;
    }

    const currentStatusFilter = currentStatus === 'placed'
      ? { $or: [{ fulfillmentStatus: 'placed' }, { fulfillmentStatus: { $exists: false } }] }
      : { fulfillmentStatus: currentStatus };
    const updatedOrder = await ShopOrder.findOneAndUpdate(
      { _id: order._id, shopId: shop._id, ...currentStatusFilter },
      update,
      { new: true }
    );
    if (!updatedOrder) return res.status(409).json({ message: 'This order changed. Refresh and try again.' });

    if (nextStatus === 'cancelled' && !order.stockRestored) {
      await ShopItem.findByIdAndUpdate(updatedOrder.shopItemId, { $inc: { quantity: updatedOrder.quantity } });
    }
    return res.json(updatedOrder);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to update delivery status.', error: err.message });
  }
};

module.exports = {
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
};
