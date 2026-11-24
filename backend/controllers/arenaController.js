const Arena = require('../models/Arena');
const { verifyArenaOnGoogleMaps } = require('../services/googlePlaces');

const parseFormValue = (value, field) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_err) {
    const error = new Error(`${field} must be valid JSON.`);
    error.statusCode = 400;
    throw error;
  }
};

// GET /arenas  (public - supports ?city=&sport=)
const getArenas = async (req, res) => {
  try {
    const { city, sport } = req.query;
    const filter = { status: 'approved' };
    if (city) filter['location.city'] = new RegExp(city, 'i');
    if (sport) filter.sportsAvailable = new RegExp(sport, 'i');

    // Highest-rated approved arenas are shown first; newer arenas break ties.
    const arenas = await Arena.find(filter)
      .populate('ownerId', 'name email')
      .sort({ rating: -1, createdAt: -1 });
    res.json(arenas);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch arenas', error: err.message });
  }
};

// GET /arenas/:id  (public)
const getArenaById = async (req, res) => {
  try {
    const arena = await Arena.findById(req.params.id).populate('ownerId', 'name email');
    if (!arena) return res.status(404).json({ message: 'Arena not found' });
    res.json(arena);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch arena', error: err.message });
  }
};

// GET /arenas/mine  (arena_owner - own arenas, any status)
const getMyArenas = async (req, res) => {
  try {
    const arenas = await Arena.find({ ownerId: req.user.id });
    res.json(arenas);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch your arenas', error: err.message });
  }
};

// GET /arenas/all  (admin - every arena regardless of status)
const getAllArenasAdmin = async (req, res) => {
  try {
    const arenas = await Arena.find().populate('ownerId', 'name email isVerified');
    res.json(arenas);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch arenas', error: err.message });
  }
};

// POST /arena  (arena_owner only)
const createArena = async (req, res) => {
  try {
    const { name, description, images } = req.body;
    const location = parseFormValue(req.body.location, 'location');
    const sportsAvailable = parseFormValue(req.body.sportsAvailable, 'sportsAvailable');

    if (!name?.trim() || !location?.address?.trim() || !location?.city?.trim() || !Array.isArray(sportsAvailable) || sportsAvailable.length === 0) {
      return res.status(400).json({ message: 'name, location and sportsAvailable are required' });
    }

    const uploadedImages = (req.files || []).map((file) => `/uploads/arenas/${file.filename}`);
    const submittedImages = images === undefined ? [] : parseFormValue(images, 'images');
    const mapsVerification = await verifyArenaOnGoogleMaps({
      name: name.trim(),
      address: location.address.trim(),
      city: location.city.trim(),
    });

    if (mapsVerification.verified) {
      location.lat = mapsVerification.lat;
      location.lng = mapsVerification.lng;
    }

    const arena = await Arena.create({
      name: name.trim(),
      location,
      sportsAvailable,
      description,
      images: uploadedImages.length ? uploadedImages : submittedImages,
      googlePlaceId: mapsVerification.placeId,
      googleMapsAddress: mapsVerification.formattedAddress,
      googleMapsVerifiedAt: mapsVerification.verified ? new Date() : undefined,
      ownerId: req.user.id,
      status: mapsVerification.verified ? 'approved' : 'pending',
    });

    res.status(201).json({ ...arena.toObject(), verificationMessage: mapsVerification.reason });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      message: err.statusCode ? err.message : 'Failed to create arena',
      ...(err.statusCode ? {} : { error: err.message }),
    });
  }
};

// PUT /arena/:id  (owner of that arena, or admin)
const updateArena = async (req, res) => {
  try {
    const arena = await Arena.findById(req.params.id);
    if (!arena) return res.status(404).json({ message: 'Arena not found' });

    const isOwner = arena.ownerId.toString() === req.user.id;
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this arena' });
    }

    const updatable = ['name', 'location', 'sportsAvailable', 'description', 'images'];
    updatable.forEach((field) => {
      if (req.body[field] !== undefined) arena[field] = req.body[field];
    });

    // only admin can change status (verification)
    if (req.user.role === 'admin' && req.body.status) {
      arena.status = req.body.status;
    }

    await arena.save();
    res.json(arena);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update arena', error: err.message });
  }
};

// DELETE /arena/:id  (owner of that arena, or admin)
const deleteArena = async (req, res) => {
  try {
    const arena = await Arena.findById(req.params.id);
    if (!arena) return res.status(404).json({ message: 'Arena not found' });

    const isOwner = arena.ownerId.toString() === req.user.id;
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this arena' });
    }

    await arena.deleteOne();
    res.json({ message: 'Arena deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete arena', error: err.message });
  }
};

module.exports = { getArenas, getArenaById, getMyArenas, getAllArenasAdmin, createArena, updateArena, deleteArena };
