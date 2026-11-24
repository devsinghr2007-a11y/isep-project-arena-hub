import { useEffect, useState } from 'react';
import { getMyArenas, createArena, createCourt, createEquipment, getBookings, getCourts, getArenaReviews, addCourtSlots, getShopItems, createShopOrder, getShopOrders, markShopOrderPaymentSubmitted } from '../../api/services';
import { mediaUrl } from '../../api/client';
import StarRating from '../../components/StarRating';

const statusStyles = {
  pending: 'bg-court-accent/20 text-court-accent-dark',
  confirmed: 'bg-court-primary/10 text-court-primary',
  cancelled: 'bg-court-danger/10 text-court-danger',
  completed: 'bg-court-ink/10 text-court-ink/60',
};

const emptyArena = { name: '', city: '', address: '', sportsAvailable: '', description: '' };
const emptyCourt = { arenaId: '', name: '', sport: '', pricePerHour: '' };
const emptyEquipment = { arenaId: '', name: '', sport: '', pricePerHour: '', quantity: '', condition: 'good' };
const emptySlot = { courtId: '', date: '', time: '' };

const shopPaymentMethodLabel = {
  upi: 'UPI payment',
  cash_on_delivery: 'Cash on delivery',
};
const shopPaymentStatusLabel = {
  pending: 'UPI payment pending',
  submitted: 'UPI payment submitted',
  confirmed: 'UPI payment confirmed',
  cash_on_delivery: 'Pay cash on delivery',
  paid_on_delivery: 'Paid on delivery',
  cancelled: 'Payment cancelled',
};
const fulfillmentLabel = {
  placed: 'Order placed',
  processing: 'Being prepared',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const displayDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
const paymentDetailsForOrder = (order) => order.shopId?.paymentQrUrl || order.shopId?.upiId || order.shopId?.paymentLink
  ? {
    upiId: order.shopId.upiId,
    paymentLink: order.shopId.paymentLink,
    paymentQrUrl: order.shopId.paymentQrUrl,
    paymentInstructions: order.shopId.paymentInstructions,
  }
  : order.paymentSnapshot || {};
const createUpiLink = (order) => {
  const upiId = paymentDetailsForOrder(order).upiId;
  if (!upiId) return null;
  const params = new URLSearchParams({ pa: upiId, pn: order.shopId?.name || 'ArenaHub shop', am: String(order.amount), cu: 'INR', tn: `ArenaHub order ${order._id}` });
  return `upi://pay?${params.toString()}`;
};

const OwnerDashboard = () => {
  const [arenas, setArenas] = useState([]);
  const [reviewsByArena, setReviewsByArena] = useState({});
  const [courts, setCourts] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [shopItems, setShopItems] = useState([]);
  const [shopOrders, setShopOrders] = useState([]);
  const [shopOrderArenaId, setShopOrderArenaId] = useState('');
  const [shopQuantities, setShopQuantities] = useState({});
  const [shopPaymentMethods, setShopPaymentMethods] = useState({});
  const [loading, setLoading] = useState(true);

  const [arenaForm, setArenaForm] = useState(emptyArena);
  const [arenaImages, setArenaImages] = useState([]);
  const [courtForm, setCourtForm] = useState(emptyCourt);
  const [equipForm, setEquipForm] = useState(emptyEquipment);
  const [slotForm, setSlotForm] = useState(emptySlot);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [{ data: myArenas }, { data: myBookings }, { data: ownerShopOrders }] = await Promise.all([getMyArenas(), getBookings(), getShopOrders()]);
    setArenas(myArenas);
    setBookings(myBookings);
    setShopOrders(ownerShopOrders);

    const courtLists = await Promise.all(myArenas.map((a) => getCourts({ arenaId: a._id })));
    setCourts(courtLists.flatMap((res) => res.data));

    // The API is role-protected: only arena owners can receive this catalog.
    // Start with the city of the first owned arena to keep the list nearby.
    const city = myArenas[0]?.location?.city;
    const { data: nearbyShopItems } = await getShopItems(city ? { city } : undefined);
    setShopItems(nearbyShopItems);
    setShopOrderArenaId((current) => current || myArenas[0]?._id || '');

    // Owners can read customer feedback about their own arenas, but this view
    // deliberately has no editing or deletion controls.
    const reviewLists = await Promise.all(myArenas.map((a) => getArenaReviews(a._id)));
    setReviewsByArena(Object.fromEntries(myArenas.map((arena, index) => [arena._id, reviewLists[index].data])));
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Shopkeepers may replace a QR code while this screen is open. A full
    // refresh keeps both the catalogue preview and placed-order QR current.
    const refreshMarketplace = window.setInterval(() => {
      load().catch(() => {});
    }, 20000);
    return () => window.clearInterval(refreshMarketplace);
  }, []);

  const earnings = bookings
    .filter((b) => b.status === 'confirmed' || b.status === 'completed')
    .reduce((sum, b) => sum + b.amount, 0);

  const handleCreateArena = async (e) => {
    e.preventDefault();
    setMsg('');
    const payload = new FormData();
    payload.append('name', arenaForm.name);
    payload.append('location', JSON.stringify({ address: arenaForm.address, city: arenaForm.city }));
    payload.append('sportsAvailable', JSON.stringify(arenaForm.sportsAvailable.split(',').map((s) => s.trim()).filter(Boolean)));
    payload.append('description', arenaForm.description);
    arenaImages.forEach((image) => payload.append('images', image));

    const { data: arena } = await createArena(payload);
    setArenaForm(emptyArena);
    setArenaImages([]);
    setMsg(arena.verificationMessage || (arena.status === 'approved'
      ? 'Arena approved and visible to customers.'
      : 'Arena submitted. An admin can approve it from Admin dashboard → Arenas.'));
    load();
  };

  const chooseArenaImages = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 5) {
      setMsg('Choose up to 5 images.');
      e.target.value = '';
      return;
    }
    const invalid = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (invalid) {
      setMsg('Use JPEG, PNG, or WebP images that are 5 MB or smaller.');
      e.target.value = '';
      return;
    }
    setMsg('');
    setArenaImages(selected);
  };

  const handleCreateCourt = async (e) => {
    e.preventDefault();
    setMsg('');
    await createCourt({ ...courtForm, pricePerHour: Number(courtForm.pricePerHour) });
    setCourtForm(emptyCourt);
    setMsg('Court added — add slots below so customers can book it.');
    load();
  };

  const handleAddSlot = async (e) => {
    e.preventDefault();
    setMsg('');
    await addCourtSlots(slotForm.courtId, [{ date: slotForm.date, time: slotForm.time }]);
    setSlotForm(emptySlot);
    setMsg('Slot added.');
    load();
  };

  const handleCreateEquipment = async (e) => {
    e.preventDefault();
    setMsg('');
    await createEquipment({
      ...equipForm,
      pricePerHour: Number(equipForm.pricePerHour),
      quantity: Number(equipForm.quantity),
    });
    setEquipForm(emptyEquipment);
    setMsg('Equipment added.');
  };

  const handleShopPurchase = async (item) => {
    const quantity = Number(shopQuantities[item._id] || 1);
    const paymentMethod = shopPaymentMethods[item._id] || 'upi';
    if (!shopOrderArenaId) {
      setMsg('Select one of your arenas before ordering equipment.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setMsg('Choose a whole-number quantity of at least 1.');
      return;
    }

    setMsg('');
    await createShopOrder({
      shopItemId: item._id,
      deliveryArenaId: shopOrderArenaId,
      quantity,
      paymentMethod,
    });
    setMsg(paymentMethod === 'cash_on_delivery'
      ? 'Equipment order placed with cash on delivery. The shopkeeper will add its expected delivery date.'
      : 'Equipment order placed. Pay by UPI from your purchase tracking section, then mark the payment as sent.');
    await load();
  };

  const submitShopUpiPayment = async (order) => {
    setMsg('');
    await markShopOrderPaymentSubmitted(order._id);
    setMsg('UPI payment marked as sent. The shopkeeper will confirm it before preparing your equipment.');
    await load();
  };

  if (loading) return <p className="max-w-5xl mx-auto px-6 py-16 text-court-ink/50 text-sm">Loading…</p>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="font-display font-bold text-3xl">Owner dashboard</h1>

      <div className="grid sm:grid-cols-3 gap-4 mt-6">
        <div className="rounded-xl border border-court-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-court-ink/50 font-semibold">Arenas</p>
          <p className="font-display font-bold text-2xl mt-1">{arenas.length}</p>
        </div>
        <div className="rounded-xl border border-court-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-court-ink/50 font-semibold">Bookings</p>
          <p className="font-display font-bold text-2xl mt-1">{bookings.length}</p>
        </div>
        <div className="rounded-xl border border-court-line bg-white p-5">
          <p className="text-xs uppercase tracking-wide text-court-ink/50 font-semibold">Earnings</p>
          <p className="font-display font-bold text-2xl mt-1 text-court-primary">₹{earnings}</p>
        </div>
      </div>

      {msg && <p className="text-sm text-court-primary mt-4">{msg}</p>}

      {/* My arenas + bookings */}
      <section className="mt-10">
        <h2 className="font-display font-semibold text-xl">My arenas</h2>
        {arenas.length === 0 ? (
          <p className="text-sm text-court-ink/50 mt-2">No arenas yet — register one below.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {arenas.map((a) => (
              <div key={a._id} className="rounded-xl border border-court-line bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{a.name}</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${
                    a.status === 'approved' ? 'bg-court-primary/10 text-court-primary'
                    : a.status === 'rejected' ? 'bg-court-danger/10 text-court-danger'
                    : 'bg-court-accent/20 text-court-accent-dark'
                  }`}>{a.status}</span>
                </div>
                <p className="text-sm text-court-ink/60">{a.location?.city}</p>
                <div className="flex items-center gap-2 mt-2">
                  <StarRating value={a.rating} size="text-sm" />
                  <span className="text-xs text-court-ink/50">{reviewsByArena[a._id]?.length || 0} review{reviewsByArena[a._id]?.length === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-3 border-t border-court-line pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-court-ink/50">Customer feedback · read only</p>
                  {(reviewsByArena[a._id] || []).length === 0 ? (
                    <p className="mt-2 text-sm text-court-ink/50">No customer feedback yet.</p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {(reviewsByArena[a._id] || []).slice(0, 3).map((review) => (
                        <div key={review._id} className="text-sm">
                          <div className="flex items-center gap-2">
                            <StarRating value={review.rating} size="text-xs" />
                            <span className="font-medium">{review.user?.name || 'Customer'}</span>
                          </div>
                          {review.comment && <p className="mt-1 text-court-ink/65">{review.comment}</p>}
                        </div>
                      ))}
                      {reviewsByArena[a._id].length > 3 && <p className="text-xs text-court-ink/50">Showing the latest 3 reviews.</p>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 className="font-display font-semibold text-lg mt-8">My courts</h3>
        {courts.length === 0 ? (
          <p className="text-sm text-court-ink/50 mt-2">No courts yet — add one below.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {courts.map((c) => {
              const open = c.availableSlots.filter((s) => !s.isBooked).length;
              return (
                <div key={c._id} className="rounded-xl border border-court-line bg-white p-4">
                  <p className="font-semibold">{c.name} <span className="text-court-ink/40 capitalize">· {c.sport}</span></p>
                  <p className="text-sm text-court-ink/60 mt-0.5">₹{c.pricePerHour}/hr · {open} open slot{open !== 1 && 's'}</p>
                </div>
              );
            })}
          </div>
        )}

        <h3 className="font-display font-semibold text-lg mt-8">Recent bookings</h3>
        {bookings.length === 0 ? (
          <p className="text-sm text-court-ink/50 mt-2">No bookings yet.</p>
        ) : (
          <div className="space-y-2 mt-3">
            {bookings.slice(0, 8).map((b) => (
              <div key={b._id} className="flex items-center justify-between rounded-xl border border-court-line bg-white p-3.5">
                <p className="text-sm">{b.arenaId?.name} · {b.courtId?.name} · {b.date} {b.time}</p>
                <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusStyles[b.status]}`}>{b.status}</span>
              </div>
            ))}
          </div>
        )}

        <h3 className="font-display font-semibold text-lg mt-8">Customer payment sessions</h3>
        <p className="mt-1 text-sm text-court-ink/60">Cashfree payment status for bookings at your arenas. These payment records are visible only to you and the platform administrator.</p>
        {bookings.length === 0 ? (
          <p className="text-sm text-court-ink/50 mt-2">No payment sessions yet.</p>
        ) : (
          <div className="space-y-2 mt-3">
            {bookings.slice(0, 8).map((booking) => (
              <div key={`payment-${booking._id}`} className="rounded-xl border border-court-line bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{booking.arenaId?.name} · ₹{booking.amount}</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusStyles[booking.status]}`}>{booking.status === 'pending' ? 'Awaiting payment' : booking.status}</span>
                </div>
                <p className="mt-1 text-xs text-court-ink/50">
                  {booking.userId?.name || 'Customer'} · {booking.paymentGateway === 'cashfree' ? 'Cashfree' : 'Payment session not started'}
                  {booking.paymentId ? ` · Reference ${booking.paymentId}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 rounded-xl border border-court-line bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display font-semibold text-xl">Nearby shopkeeper equipment</h2>
            <p className="mt-1 text-sm text-court-ink/60">This catalog is available only to arena owners. Shopkeepers see your owner and delivery-arena details after you order, never customer details.</p>
          </div>
          <label className="text-sm font-medium">
            Deliver to
            <select value={shopOrderArenaId} onChange={(e) => setShopOrderArenaId(e.target.value)} className="mt-1 block min-w-48 rounded-lg border border-court-line px-3 py-2 text-sm">
              <option value="">Select your arena</option>
              {arenas.map((arena) => <option key={arena._id} value={arena._id}>{arena.name} · {arena.location?.city}</option>)}
            </select>
          </label>
        </div>

        {shopItems.length === 0 ? (
          <p className="mt-4 text-sm text-court-ink/50">No shopkeeper equipment is available near your arena yet.</p>
        ) : (
          <div className="grid gap-4 mt-5 sm:grid-cols-2 lg:grid-cols-3">
            {shopItems.map((item) => (
              <article key={item._id} className="rounded-lg border border-court-line p-4">
                <p className="font-semibold">{item.name}</p>
                <p className="text-sm text-court-ink/60">{item.shopId?.name} · {item.shopId?.city}</p>
                <p className="mt-2 text-sm">₹{item.price} · {item.quantity} available</p>
                {item.description && <p className="mt-1 text-xs text-court-ink/50">{item.description}</p>}
                <label className="mt-4 block text-xs font-medium text-court-ink/60">
                  Pay with
                  <select value={shopPaymentMethods[item._id] || 'upi'} onChange={(e) => setShopPaymentMethods({ ...shopPaymentMethods, [item._id]: e.target.value })} className="mt-1 block w-full rounded-lg border border-court-line px-2 py-2 text-sm text-court-ink">
                    <option value="upi">UPI</option>
                    <option value="cash_on_delivery">Cash on delivery</option>
                  </select>
                </label>
                {(shopPaymentMethods[item._id] || 'upi') === 'upi' && (
                  <div className="mt-3 rounded-lg bg-court-primary/5 p-3 text-xs text-court-ink/70">
                    <p className="font-medium text-court-ink">Shopkeeper UPI QR</p>
                    {item.shopId?.paymentQrUrl ? <img src={mediaUrl(item.shopId.paymentQrUrl)} alt={`UPI QR for ${item.shopId?.name || 'shopkeeper'}`} className="mt-2 h-28 w-28 rounded-lg border border-court-line bg-white object-contain" /> : <p className="mt-1">This shopkeeper has not uploaded a UPI QR yet. You can choose cash on delivery instead.</p>}
                    {item.shopId?.upiId && <p className="mt-2">UPI ID: <span className="font-medium">{item.shopId.upiId}</span></p>}
                    {item.shopId?.paymentInstructions && <p className="mt-1">{item.shopId.paymentInstructions}</p>}
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <input aria-label={`Quantity for ${item.name}`} min="1" max={item.quantity} type="number" value={shopQuantities[item._id] || 1} onChange={(e) => setShopQuantities({ ...shopQuantities, [item._id]: e.target.value })} className="w-20 rounded-lg border border-court-line px-2 py-2 text-sm" />
                  <button type="button" onClick={() => handleShopPurchase(item)} disabled={!item.quantity || !shopOrderArenaId} className="flex-1 rounded-full bg-court-primary px-3 py-2 text-sm font-semibold text-white hover:bg-court-primary-dark disabled:opacity-50">Order equipment</button>
                </div>
              </article>
            ))}
          </div>
        )}

      </section>

      <section className="mt-12 rounded-xl border border-court-line bg-white p-5">
        <h2 className="font-display font-semibold text-xl">Equipment purchase tracking</h2>
        <p className="mt-1 text-sm text-court-ink/60">Choose UPI or cash on delivery when ordering. The shopkeeper sets the expected delivery date and updates the delivery progress.</p>
        {shopOrders.length === 0 ? <p className="mt-4 text-sm text-court-ink/50">No equipment purchases yet.</p> : (
          <div className="mt-5 space-y-4">
            {shopOrders.map((order) => {
              const upiLink = createUpiLink(order);
              const paymentDetails = paymentDetailsForOrder(order);
              const timeline = order.statusTimeline?.length ? order.statusTimeline : [{ status: order.fulfillmentStatus || 'placed', at: order.createdAt }];
              return (
                <article key={order._id} className="rounded-lg border border-court-line p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{order.itemName} × {order.quantity} · ₹{order.amount}</p>
                      <p className="text-sm text-court-ink/60">{order.shopId?.name || 'Shopkeeper'} · delivery to {order.deliveryArenaId?.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-court-primary/10 px-2.5 py-1 text-xs font-medium text-court-primary">{shopPaymentMethodLabel[order.paymentMethod] || 'UPI payment'}</span>
                      <span className="rounded-full bg-court-ink/10 px-2.5 py-1 text-xs font-medium text-court-ink/70">{fulfillmentLabel[order.fulfillmentStatus] || 'Order placed'}</span>
                    </div>
                  </div>

                  <p className="mt-3 text-sm"><span className="font-medium">Payment:</span> {shopPaymentStatusLabel[order.paymentStatus] || 'UPI payment pending'}</p>
                  {order.estimatedDeliveryDate ? <p className="mt-1 text-sm text-court-primary"><span className="font-medium">Expected delivery:</span> {displayDate(order.estimatedDeliveryDate)}</p> : order.fulfillmentStatus !== 'cancelled' && <p className="mt-1 text-sm text-court-ink/55">The shopkeeper will confirm the expected delivery date soon.</p>}

                  {order.paymentMethod === 'cash_on_delivery' ? (
                    <p className="mt-3 rounded-lg bg-court-primary/5 px-3 py-2 text-sm text-court-ink/70">Pay ₹{order.amount} to the shopkeeper when this equipment is delivered.</p>
                  ) : order.paymentStatus === 'pending' ? (
                    <div className="mt-3 rounded-lg bg-court-primary/5 p-3 text-sm">
                      <p className="font-medium">Pay by UPI</p>
                      {paymentDetails.paymentLink && <p className="mt-1"><a href={paymentDetails.paymentLink} target="_blank" rel="noreferrer" className="font-medium text-court-primary hover:underline">Open the shopkeeper payment link ↗</a></p>}
                      {paymentDetails.upiId && <p className="mt-1">UPI ID: <span className="font-medium">{paymentDetails.upiId}</span></p>}
                      {paymentDetails.paymentInstructions && <p className="mt-1 text-court-ink/60">{paymentDetails.paymentInstructions}</p>}
                      {paymentDetails.paymentQrUrl && <img src={mediaUrl(paymentDetails.paymentQrUrl)} alt="Shopkeeper payment QR" className="mt-3 h-28 w-28 rounded-lg border border-court-line object-contain" />}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {upiLink && <a href={upiLink} className="rounded-full border border-court-primary px-3 py-2 text-xs font-semibold text-court-primary hover:bg-court-primary/10">Open UPI app</a>}
                        <button type="button" onClick={() => submitShopUpiPayment(order)} className="rounded-full bg-court-primary px-3 py-2 text-xs font-semibold text-white hover:bg-court-primary-dark">I have paid via UPI</button>
                      </div>
                    </div>
                  ) : order.paymentStatus === 'submitted' ? <p className="mt-3 text-sm text-court-ink/60">Payment was sent. Waiting for the shopkeeper to confirm it.</p> : null}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-court-ink/55">
                    {timeline.map((event, index) => <span key={`${event.status}-${event.at || index}`} className="rounded-full border border-court-line px-2 py-1">{fulfillmentLabel[event.status] || event.status} {event.at && `· ${displayDate(event.at)}`}</span>)}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Forms */}
      <div className="grid md:grid-cols-2 gap-6 mt-12">
        <form onSubmit={handleCreateArena} className="rounded-xl border border-court-line bg-white p-5 space-y-3">
          <h3 className="font-display font-semibold">Register arena</h3>
          <input required placeholder="Arena name" value={arenaForm.name} onChange={(e) => setArenaForm({ ...arenaForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required placeholder="City" value={arenaForm.city} onChange={(e) => setArenaForm({ ...arenaForm, city: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required placeholder="Address" value={arenaForm.address} onChange={(e) => setArenaForm({ ...arenaForm, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required placeholder="Sports (comma separated)" value={arenaForm.sportsAvailable} onChange={(e) => setArenaForm({ ...arenaForm, sportsAvailable: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <textarea placeholder="Description" value={arenaForm.description} onChange={(e) => setArenaForm({ ...arenaForm, description: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" rows={2} />
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="arena-images">Arena images</label>
            <input id="arena-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={chooseArenaImages} className="block w-full text-sm text-court-ink/60 file:mr-3 file:rounded-full file:border-0 file:bg-court-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-court-primary hover:file:bg-court-primary/20" />
            <p className="mt-1 text-xs text-court-ink/50">Optional: up to 5 JPEG, PNG, or WebP images (5 MB each).</p>
            {arenaImages.length > 0 && <p className="mt-1 text-xs text-court-primary">{arenaImages.length} image{arenaImages.length !== 1 && 's'} selected.</p>}
          </div>
          <button className="w-full py-2.5 rounded-full bg-court-primary text-white text-sm font-semibold hover:bg-court-primary-dark transition-colors">Submit arena</button>
        </form>

        <form onSubmit={handleCreateCourt} className="rounded-xl border border-court-line bg-white p-5 space-y-3">
          <h3 className="font-display font-semibold">Add court</h3>
          <select required value={courtForm.arenaId} onChange={(e) => setCourtForm({ ...courtForm, arenaId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm">
            <option value="">Select arena</option>
            {arenas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
          <input required placeholder="Court name" value={courtForm.name} onChange={(e) => setCourtForm({ ...courtForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required placeholder="Sport" value={courtForm.sport} onChange={(e) => setCourtForm({ ...courtForm, sport: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required type="number" placeholder="Price per hour" value={courtForm.pricePerHour} onChange={(e) => setCourtForm({ ...courtForm, pricePerHour: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <button className="w-full py-2.5 rounded-full bg-court-primary text-white text-sm font-semibold hover:bg-court-primary-dark transition-colors">Add court</button>
        </form>

        <form onSubmit={handleCreateEquipment} className="rounded-xl border border-court-line bg-white p-5 space-y-3">
          <h3 className="font-display font-semibold">Add equipment</h3>
          <select required value={equipForm.arenaId} onChange={(e) => setEquipForm({ ...equipForm, arenaId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm">
            <option value="">Select arena</option>
            {arenas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
          <input required placeholder="Equipment name" value={equipForm.name} onChange={(e) => setEquipForm({ ...equipForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required placeholder="Sport" value={equipForm.sport} onChange={(e) => setEquipForm({ ...equipForm, sport: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required type="number" placeholder="Price per hour" value={equipForm.pricePerHour} onChange={(e) => setEquipForm({ ...equipForm, pricePerHour: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required type="number" placeholder="Quantity" value={equipForm.quantity} onChange={(e) => setEquipForm({ ...equipForm, quantity: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <button className="w-full py-2.5 rounded-full bg-court-primary text-white text-sm font-semibold hover:bg-court-primary-dark transition-colors">Add equipment</button>
        </form>

        <form onSubmit={handleAddSlot} className="rounded-xl border border-court-line bg-white p-5 space-y-3">
          <h3 className="font-display font-semibold">Open a booking slot</h3>
          <select required value={slotForm.courtId} onChange={(e) => setSlotForm({ ...slotForm, courtId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm">
            <option value="">Select court</option>
            {courts.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <input required type="date" value={slotForm.date} onChange={(e) => setSlotForm({ ...slotForm, date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <input required placeholder="Time, e.g. 18:00-19:00" value={slotForm.time} onChange={(e) => setSlotForm({ ...slotForm, time: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-court-line text-sm" />
          <button className="w-full py-2.5 rounded-full bg-court-primary text-white text-sm font-semibold hover:bg-court-primary-dark transition-colors">Add slot</button>
        </form>
      </div>
    </div>
  );
};

export default OwnerDashboard;
