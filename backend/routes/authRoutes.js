const express = require('express');
const {
  requestRegistrationOtp,
  verifyRegistrationOtp,
  login,
} = require('../controllers/authController');
const router = express.Router();

// Kept as an alias so older clients cannot bypass OTP verification.
router.post('/register', requestRegistrationOtp);
router.post('/register/request-otp', requestRegistrationOtp);
router.post('/register/verify-otp', verifyRegistrationOtp);
router.post('/login', login);

module.exports = router;
