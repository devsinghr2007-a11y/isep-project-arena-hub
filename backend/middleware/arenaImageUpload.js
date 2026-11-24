const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '..', 'uploads', 'arenas');
const extensions = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdirSync(uploadDirectory, { recursive: true });
    callback(null, uploadDirectory);
  },
  filename: (_req, file, callback) => {
    callback(null, `arena-${Date.now()}-${crypto.randomUUID()}${extensions[file.mimetype]}`);
  },
});

const imageFilter = (_req, file, callback) => {
  if (!extensions[file.mimetype]) {
    const error = new Error('Only JPEG, PNG, and WebP images can be uploaded.');
    error.statusCode = 400;
    return callback(error);
  }
  return callback(null, true);
};

const uploadArenaImages = multer({
  storage,
  fileFilter: imageFilter,
  limits: { files: 5, fileSize: 5 * 1024 * 1024 },
}).array('images', 5);

module.exports = { uploadArenaImages };
