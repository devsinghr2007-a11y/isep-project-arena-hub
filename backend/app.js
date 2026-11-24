require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const arenaRoutes = require('./routes/arenaRoutes');
const courtRoutes = require('./routes/courtRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const equipmentRentalRoutes = require('./routes/equipmentRentalRoutes');
const userRoutes = require('./routes/userRoutes');
const shopRoutes = require('./routes/shopRoutes');

const app = express();

app.use(cors());
// Cashfree signs the exact unmodified payload of its webhook. Preserve that
// raw value while still parsing normal API requests as JSON.
app.use(express.json({ verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8'); } }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => res.json({ status: 'ArenaHub API running' }));

app.use('/api', authRoutes);
app.use('/api', arenaRoutes);
app.use('/api', courtRoutes);
app.use('/api', equipmentRoutes);
app.use('/api', bookingRoutes);
app.use('/api', paymentRoutes);
app.use('/api', reviewRoutes);
app.use('/api', equipmentRentalRoutes);
app.use('/api', userRoutes);
app.use('/api', shopRoutes);
app.use('/api/auth', authRoutes);

// 404 handler
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Generic error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Each image must be 5 MB or smaller.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ message: 'You can upload up to 5 images.' });
  }
  return res.status(err.statusCode || 500).json({ message: err.statusCode ? err.message : 'Server error' });
});

module.exports = app;
