const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'shop-payments');
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const uploadShopPaymentQr = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdirSync(uploadDirectory, { recursive: true });
      callback(null, uploadDirectory);
    },
    filename: (_req, file, callback) => callback(null, `shop-payment-${Date.now()}-${crypto.randomUUID()}${extensions[file.mimetype]}`),
  }),
  fileFilter: (_req, file, callback) => {
    if (extensions[file.mimetype]) return callback(null, true);
    const error = new Error('Payment QR must be a JPEG, PNG, or WebP image.');
    error.statusCode = 400;
    return callback(error);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('paymentQr');

module.exports = { uploadShopPaymentQr };
