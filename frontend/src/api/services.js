import client from './client';

// Auth
export const requestRegistrationOtp = (data) => client.post('/register/request-otp', data);
export const verifyRegistrationOtp = (data) => client.post('/register/verify-otp', data);
export const loginUser = (data) => client.post('/login', data);

// Arenas
export const getArenas = (params) => client.get('/arenas', { params });
export const getArenaById = (id) => client.get(`/arenas/${id}`);
export const getMyArenas = () => client.get('/arenas/mine');
export const getAllArenasAdmin = () => client.get('/arenas/all');
export const createArena = (data) => client.post('/arena', data);
export const updateArena = (id, data) => client.put(`/arena/${id}`, data);
export const deleteArena = (id) => client.delete(`/arena/${id}`);

// Courts
export const getCourts = (params) => client.get('/courts', { params });
export const createCourt = (data) => client.post('/court', data);
export const addCourtSlots = (id, slots) => client.post(`/court/${id}/slots`, { slots });

// Equipment
export const getEquipment = (params) => client.get('/equipment', { params });
export const createEquipment = (data) => client.post('/equipment', data);

// Bookings
export const createBooking = (data) => client.post('/booking', data);
export const getBookings = () => client.get('/booking');

// Razorpay payment gateway
export const createRazorpayOrder = (data) => client.post('/payment/razorpay/order', data);
export const verifyRazorpayPayment = (data) => client.post('/payment/razorpay/verify', data);

// Cashfree payment gateway
export const createCashfreeOrder = (data) => client.post('/payment/order', data);
export const verifyCashfreePayment = (data) => client.post('/payment/verify', data);

// Reviews
export const getArenaReviews = (arenaId) => client.get(`/arenas/${arenaId}/reviews`);
export const createReview = (arenaId, data) => client.post(`/arenas/${arenaId}/reviews`, data);
export const deleteReview = (id) => client.delete(`/reviews/${id}`);

// Equipment rentals
export const createRental = (data) => client.post('/rental', data);
export const getRentals = () => client.get('/rental');
export const returnRental = (id) => client.put(`/rental/${id}/return`);

// Shopkeeper marketplace — catalog and payment details are restricted to
// arena owners; shopkeepers only receive the arena-owner orders placed with them.
export const getShopProfile = () => client.get('/shop/profile');
export const saveShopProfile = (data) => client.post('/shop/profile', data);
export const createShopItem = (data) => client.post('/shop/items', data);
export const getMyShopItems = () => client.get('/shop/items/mine');
export const getShopItems = (params) => client.get('/shop/items', { params });
export const createShopOrder = (data) => client.post('/shop/orders', data);
export const getShopOrders = () => client.get('/shop/orders');
export const markShopOrderPaymentSubmitted = (id) => client.put(`/shop/orders/${id}/payment-submitted`);
export const confirmShopOrderPayment = (id) => client.put(`/shop/orders/${id}/confirm-payment`);
export const updateShopOrderFulfillment = (id, data) => client.put(`/shop/orders/${id}/fulfillment`, data);

// Admin — users & reports
export const getUsers = (params) => client.get('/users', { params });
export const verifyUser = (id) => client.put(`/users/${id}/verify`);
export const deleteUser = (id) => client.delete(`/users/${id}`);
export const getReports = () => client.get('/admin/reports');
