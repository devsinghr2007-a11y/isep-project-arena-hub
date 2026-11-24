const crypto = require('crypto');
const Razorpay = require('razorpay');
const Booking = require('../models/Booking');
const User = require('../models/User');

const CASHFREE_API_VERSION = '2025-01-01';
const CASHFREE_SANDBOX_URL = 'https://sandbox.cashfree.com/pg';
const CASHFREE_PRODUCTION_URL = 'https://api.cashfree.com/pg';

const cashfreeEnvironment = () =>
  process.env.CASHFREE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

const cashfreeBaseUrl = () =>
  cashfreeEnvironment() === 'production' ? CASHFREE_PRODUCTION_URL : CASHFREE_SANDBOX_URL;

const cashfreeCredentials = () => {
  const clientId = process.env.CASHFREE_CLIENT_ID?.trim();
  const clientSecret = process.env.CASHFREE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    const error = new Error('Cashfree is not configured. Add CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET to backend/.env.');
    error.statusCode = 503;
    throw error;
  }

  return { clientId, clientSecret };
};

const toCashfreePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  // ArenaHub registration stores Indian numbers as +91XXXXXXXXXX. Cashfree's
  // customer_phone field expects the local ten-digit mobile number.
  return digits.length >= 10 ? digits.slice(-10) : '';
};

const responseMessage = (body, fallback) =>
  body?.message || body?.type || body?.code || fallback;

const cashfreeRequest = async (path, { method = 'GET', body } = {}) => {
  const { clientId, clientSecret } = cashfreeCredentials();
  const response = await fetch(`${cashfreeBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': CASHFREE_API_VERSION,
      'x-client-id': clientId,
      'x-client-secret': clientSecret,
      'x-request-id': crypto.randomUUID(),
      ...(method === 'POST' ? { 'x-idempotency-key': crypto.randomUUID() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const error = new Error(responseMessage(data, 'Cashfree could not process the payment request.'));
    error.statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw error;
  }

  return data;
};

const ownedBooking = async (bookingId, userId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }
  if (booking.userId.toString() !== userId) {
    const error = new Error('Not authorized for this booking');
    error.statusCode = 403;
    throw error;
  }
  return booking;
};

const cashfreeOrderIdFor = (booking) => `arenahub_${booking._id.toString()}`;

// POST /payment/order - create a Cashfree payment session for a pending booking.
const createOrder = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const booking = await ownedBooking(bookingId, req.user.id);
    if (booking.status !== 'pending') {
      return res.status(409).json({ message: 'This booking is no longer awaiting payment.' });
    }

    // Re-use the original session when a customer closes Cashfree Checkout and
    // chooses to try again, instead of making a duplicate external order.
    if (booking.cashfreeOrderId && booking.cashfreePaymentSessionId) {
      return res.json({
        orderId: booking.cashfreeOrderId,
        paymentSessionId: booking.cashfreePaymentSessionId,
        environment: cashfreeEnvironment(),
      });
    }

    const user = await User.findById(req.user.id).select('name email phone');
    const customerPhone = toCashfreePhone(user?.phone);
    if (!customerPhone) {
      return res.status(400).json({ message: 'Add a valid ten-digit Indian mobile number to your account before paying.' });
    }

    const orderId = cashfreeOrderIdFor(booking);
    const orderMeta = {};
    if (process.env.CASHFREE_RETURN_URL?.trim()) orderMeta.return_url = process.env.CASHFREE_RETURN_URL.trim();
    if (process.env.CASHFREE_NOTIFY_URL?.trim()) orderMeta.notify_url = process.env.CASHFREE_NOTIFY_URL.trim();

    const order = await cashfreeRequest('/orders', {
      method: 'POST',
      body: {
        order_id: orderId,
        order_amount: Number(booking.amount.toFixed(2)),
        order_currency: 'INR',
        customer_details: {
          customer_id: `user_${user._id.toString()}`,
          customer_name: user.name,
          customer_email: user.email,
          customer_phone: customerPhone,
        },
        ...(Object.keys(orderMeta).length ? { order_meta: orderMeta } : {}),
        order_note: `ArenaHub booking ${booking._id.toString()}`,
      },
    });

    if (!order.payment_session_id) {
      throw new Error('Cashfree did not return a payment session.');
    }

    booking.cashfreeOrderId = order.order_id || orderId;
    booking.cashfreePaymentSessionId = order.payment_session_id;
    booking.paymentGateway = 'cashfree';
    await booking.save();

    return res.json({
      orderId: booking.cashfreeOrderId,
      paymentSessionId: booking.cashfreePaymentSessionId,
      environment: cashfreeEnvironment(),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Failed to create Cashfree payment order.',
    });
  }
};

const confirmBookingFromCashfreeOrder = async (booking) => {
  if (!booking.cashfreeOrderId) {
    const error = new Error('No Cashfree payment order exists for this booking.');
    error.statusCode = 409;
    throw error;
  }

  const order = await cashfreeRequest(`/orders/${encodeURIComponent(booking.cashfreeOrderId)}`);
  if (order.order_status !== 'PAID') {
    const error = new Error('Payment is not complete yet. Finish the Cashfree payment and try again.');
    error.statusCode = 409;
    throw error;
  }

  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'pending' },
    {
      $set: {
        status: 'confirmed',
        paymentGateway: 'cashfree',
        paymentId: String(order.cf_order_id || order.order_id || booking.cashfreeOrderId),
      },
    },
    { new: true }
  );

  return confirmed || Booking.findById(booking._id);
};

// POST /payment/verify - query Cashfree directly before confirming a booking.
const verifyPayment = async (req, res) => {
  try {
    const booking = await ownedBooking(req.body.bookingId, req.user.id);
    if (booking.status === 'confirmed') return res.json({ message: 'Payment already verified.', booking });

    const confirmed = await confirmBookingFromCashfreeOrder(booking);
    return res.json({ message: 'Cashfree payment verified.', booking: confirmed });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Cashfree payment verification failed.',
    });
  }
};

const hasValidWebhookSignature = (req) => {
  const { clientSecret } = cashfreeCredentials();
  const timestamp = String(req.headers['x-webhook-timestamp'] || '');
  const signature = String(req.headers['x-webhook-signature'] || '');
  const rawBody = req.rawBody || '';
  if (!timestamp || !signature || !rawBody) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() - timestampNumber) > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac('sha256', clientSecret)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

// POST /payment/cashfree/webhook - Cashfree calls this endpoint after payments.
// The signature is verified against the untouched raw request body before any
// booking status is changed.
const cashfreeWebhook = async (req, res) => {
  try {
    if (!hasValidWebhookSignature(req)) return res.status(400).json({ message: 'Invalid Cashfree webhook signature.' });

    const orderId = req.body?.data?.order?.order_id || req.body?.order_id;
    const paymentStatus = req.body?.data?.payment?.payment_status || req.body?.payment_status;
    const paymentId = req.body?.data?.payment?.cf_payment_id || req.body?.cf_payment_id;

    if (orderId && paymentStatus === 'SUCCESS') {
      await Booking.findOneAndUpdate(
        { cashfreeOrderId: orderId, status: 'pending' },
        { $set: { status: 'confirmed', paymentGateway: 'cashfree', paymentId: String(paymentId || orderId) } }
      );
    }

    return res.status(200).json({ received: true });
  } catch (_err) {
    // A non-2xx response tells Cashfree to retry. Do not reveal configuration
    // details or secrets in a webhook response.
    return res.status(500).json({ message: 'Unable to process Cashfree webhook.' });
  }
};

// ==================== RAZORPAY INTEGRATION ====================

const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID?.trim();
  const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!key_id || !key_secret) {
    const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.');
    error.statusCode = 503;
    throw error;
  }
  return new Razorpay({ key_id, key_secret });
};

// POST /payment/razorpay/order
const createRazorpayOrder = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const booking = await ownedBooking(bookingId, req.user.id);
    if (booking.status !== 'pending') {
      return res.status(409).json({ message: 'This booking is no longer awaiting payment.' });
    }

    const razorpay = getRazorpayInstance();
    const amountInPaise = Math.round(booking.amount * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${booking._id.toString().slice(-10)}`,
      notes: {
        bookingId: booking._id.toString(),
        userId: req.user.id,
      },
    });

    booking.razorpayOrderId = order.id;
    booking.paymentGateway = 'razorpay';
    await booking.save();

    return res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID?.trim(),
      bookingId: booking._id,
    });
  } catch (err) {
    console.error('[Razorpay createOrder error]', err);
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Failed to create Razorpay payment order.',
    });
  }
};

// POST /payment/razorpay/verify
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const booking = await ownedBooking(bookingId, req.user.id);

    if (booking.status === 'confirmed') {
      return res.json({ message: 'Payment already verified.', booking });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET?.trim();
    if (!key_secret) {
      return res.status(503).json({ message: 'Razorpay secret key is not configured.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: 'Invalid payment signature. Verification failed.' });
    }

    booking.status = 'confirmed';
    booking.paymentGateway = 'razorpay';
    booking.paymentId = razorpay_payment_id;
    booking.razorpayPaymentId = razorpay_payment_id;
    booking.razorpaySignature = razorpay_signature;
    await booking.save();

    return res.json({ message: 'Razorpay payment verified successfully.', booking });
  } catch (err) {
    console.error('[Razorpay verifyPayment error]', err);
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Razorpay payment verification failed.',
    });
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  cashfreeWebhook,
  createRazorpayOrder,
  verifyRazorpayPayment,
};
