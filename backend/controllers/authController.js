const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const PendingRegistration = require('../models/PendingRegistration');
const User = require('../models/User');

const OTP_LENGTH = 6;
const MAX_OTP_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const generateToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const hashOtp = (otp) => crypto.createHash('sha256').update(otp).digest('hex');

const createOtp = () =>
  crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');

const getOtpExpiryMs = () => {
  const value = Number(process.env.OTP_TTL_MINUTES || 10);
  const minutes = Number.isFinite(value) && value >= 5 && value <= 30 ? value : 10;
  return minutes * 60 * 1000;
};

const normalisePhone = (phone) => {
  const compact = String(phone || '').trim().replace(/[\s()-]/g, '');

  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^\d{10}$/.test(compact)) return `+91${compact}`;

  return null;
};

const getMailTransporter = () => {
  const gmailUser = process.env.GMAIL_USER?.trim();
  // Google displays app passwords in four-character groups. Removing whitespace
  // lets either the grouped or contiguous form work in a .env file.
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, '');

  if (!gmailUser || !gmailAppPassword) {
    const error = new Error('Email OTP is not configured. Add GMAIL_USER and GMAIL_APP_PASSWORD to backend/.env.');
    error.statusCode = 503;
    throw error;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
};

const sendEmailVerificationCode = async ({ email, emailOtp }) => {
  const mailer = getMailTransporter();
  const ttl = Number(process.env.OTP_TTL_MINUTES || 10);

  await mailer.sendMail({
    from: process.env.GMAIL_FROM?.trim() || process.env.GMAIL_USER?.trim(),
    to: email,
    subject: 'Your ArenaHub email verification code',
    text: `Your ArenaHub email verification code is ${emailOtp}. It expires in ${ttl} minutes. Do not share this code.`,
  });
};

const findExistingUser = (email, phone, submittedPhone) =>
  User.findOne({
    $or: [{ email }, { phone }, { phone: submittedPhone.trim() }],
  });

// POST /register/request-otp
const requestRegistrationOtp = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    const normalisedEmail = String(email || '').trim().toLowerCase();
    const normalisedPhone = normalisePhone(phone);

    if (!name?.trim() || !normalisedEmail || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (!/^\S+@\S+\.\S+$/.test(normalisedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    if (!normalisedPhone) {
      return res.status(400).json({ message: 'Enter a valid phone number, including country code if it is not an Indian number.' });
    }

    const existingUser = await findExistingUser(normalisedEmail, normalisedPhone, String(phone));
    if (existingUser) {
      return res.status(409).json({ message: 'An account already uses this email address or phone number.' });
    }

    const now = new Date();
    const pending = await PendingRegistration.findOne({ email: normalisedEmail });
    const mayResendAt = pending?.lastSentAt?.getTime() + OTP_RESEND_COOLDOWN_MS;
    if (pending && pending.expiresAt > now && Date.now() < mayResendAt) {
      const seconds = Math.ceil((mayResendAt - Date.now()) / 1000);
      return res.status(429).json({ message: `Please wait ${seconds} seconds before requesting a new code.` });
    }

    const emailOtp = createOtp();
    const allowedRole = ['customer', 'arena_owner', 'shop_keeper'].includes(role) ? role : 'customer';

    await PendingRegistration.findOneAndUpdate(
      { email: normalisedEmail },
      {
        $set: {
          name: name.trim(),
          email: normalisedEmail,
          phone: normalisedPhone,
          password: await bcrypt.hash(password, 10),
          role: allowedRole,
          emailOtpHash: hashOtp(emailOtp),
          emailAttempts: 0,
          lastSentAt: now,
          expiresAt: new Date(now.getTime() + getOtpExpiryMs()),
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    try {
      await sendEmailVerificationCode({ email: normalisedEmail, emailOtp });
    } catch (error) {
      await PendingRegistration.deleteOne({ email: normalisedEmail });
      throw error;
    }

    return res.status(202).json({ message: 'A verification code was sent to your email address.' });
  } catch (err) {
    console.error('Registration OTP error:', err);
    return res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Unable to send the email verification code. Please try again.',
    });
  }
};

// POST /register/verify-otp
const verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, emailOtp } = req.body;
    const normalisedEmail = String(email || '').trim().toLowerCase();

    if (!normalisedEmail || !/^\d{6}$/.test(String(emailOtp || ''))) {
      return res.status(400).json({ message: 'Enter the 6-digit email verification code.' });
    }

    const pending = await PendingRegistration.findOne({ email: normalisedEmail });
    if (!pending || pending.expiresAt <= new Date()) {
      if (pending) await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(400).json({ message: 'Your verification code has expired. Request a new code to continue.' });
    }

    if (hashOtp(emailOtp) !== pending.emailOtpHash) {
      const emailAttempts = pending.emailAttempts + 1;

      if (emailAttempts >= MAX_OTP_ATTEMPTS) {
        await PendingRegistration.deleteOne({ _id: pending._id });
        return res.status(429).json({ message: 'Too many incorrect attempts. Request a new verification code to continue.' });
      }

      await PendingRegistration.updateOne({ _id: pending._id }, { $set: { emailAttempts } });
      return res.status(400).json({ message: 'The email verification code is incorrect.' });
    }

    const existingUser = await findExistingUser(pending.email, pending.phone, pending.phone);
    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(409).json({ message: 'An account already uses this email address or phone number.' });
    }

    const user = await User.create({
      name: pending.name,
      email: pending.email,
      password: pending.password,
      role: pending.role,
      phone: pending.phone,
      emailVerified: true,
      phoneVerified: false,
    });

    await PendingRegistration.deleteOne({ _id: pending._id });
    const token = generateToken(user);

    return res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    return res.status(500).json({ message: 'Unable to complete registration. Please try again.' });
  }
};

// POST /login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = generateToken(user);
    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Login failed. Please try again.' });
  }
};

module.exports = { requestRegistrationOtp, verifyRegistrationOtp, login };
