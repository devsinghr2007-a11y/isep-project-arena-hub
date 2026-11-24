import { useEffect, useState } from 'react';
import { confirmShopOrderPayment, createShopItem, getMyShopItems, getShopOrders, getShopProfile, saveShopProfile, updateShopOrderFulfillment } from '../../api/services';
import { mediaUrl } from '../../api/client';

const emptyProfile = {
  name: '', address: '', city: '', phone: '', upiId: '', paymentLink: '', paymentInstructions: '',
};
const emptyItem = { name: '', sport: '', description: '', price: '', quantity: '' };

const paymentLabel = {
  pending: 'UPI payment pending',
  submitted: 'UPI payment submitted',
  confirmed: 'UPI payment confirmed',
  cash_on_delivery: 'Cash on delivery',
  paid_on_delivery: 'Paid on delivery',
  cancelled: 'Cancelled',
};
const fulfillmentLabel = {
  placed: 'Order placed',
  processing: 'Preparing',
  packed: 'Packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const nextFulfillmentStatuses = {
  placed: ['placed', 'processing', 'cancelled'],
  processing: ['processing', 'packed', 'cancelled'],
  packed: ['packed', 'out_for_delivery', 'cancelled'],
  out_for_delivery: ['out_for_delivery', 'delivered'],
  delivered: ['delivered'],
  cancelled: ['cancelled'],
};
const toDateInput = (value) => value ? new Date(value).toLocaleDateString('en-CA') : '';

const ShopkeeperDashboard = () => {
  const [profile, setProfile] = useState(emptyProfile);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deliveryUpdates, setDeliveryUpdates] = useState({});
  const [itemForm, setItemForm] = useState(emptyItem);
  const [paymentQr, setPaymentQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [profileResult, itemResult, orderResult] = await Promise.all([getShopProfile(), getMyShopItems(), getShopOrders()]);
    if (profileResult.data) setProfile({ ...emptyProfile, ...profileResult.data });
    setItems(itemResult.data);
    setOrders(orderResult.data);
  };

  useEffect(() => { load().catch(() => setError('Unable to load your shop.')).finally(() => setLoading(false)); }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setError(''); setMessage('');
    try {
      const payload = new FormData();
      Object.entries(profile).forEach(([key, value]) => payload.append(key, value || ''));
      if (paymentQr) payload.append('paymentQr', paymentQr);
      const { data } = await saveShopProfile(payload);
      setProfile({ ...emptyProfile, ...data });
      setPaymentQr(null);
      setMessage('Shop and payment details saved. They are visible only to arena owners buying equipment.');
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save shop details.');
    }
  };

  const addItem = async (event) => {
    event.preventDefault();
    setError(''); setMessage('');
    try {
      await createShopItem({ ...itemForm, price: Number(itemForm.price), quantity: Number(itemForm.quantity) });
      setItemForm(emptyItem);
      setMessage('Equipment added to your arena-owner catalog.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to add equipment.');
    }
  };

  const confirmPayment = async (id) => {
    setError(''); setMessage('');
    try {
      await confirmShopOrderPayment(id);
      setMessage('UPI payment confirmed. Add the delivery date, then move the order through preparation and delivery.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to confirm payment.');
    }
  };

  const updateDelivery = async (order) => {
    setError(''); setMessage('');
    const changes = deliveryUpdates[order._id] || {};
    try {
      await updateShopOrderFulfillment(order._id, {
        fulfillmentStatus: changes.fulfillmentStatus || order.fulfillmentStatus || 'placed',
        estimatedDeliveryDate: changes.estimatedDeliveryDate ?? toDateInput(order.estimatedDeliveryDate),
      });
      setDeliveryUpdates((current) => ({ ...current, [order._id]: {} }));
      setMessage('Order delivery details updated. The arena owner can now track the expected arrival.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to update delivery details.');
    }
  };

  if (loading) return <p className="max-w-6xl mx-auto px-6 py-16 text-court-ink/50 text-sm">Loading shop…</p>;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="font-display font-bold text-3xl">Shopkeeper dashboard</h1>
      <p className="mt-2 text-sm text-court-ink/60">List equipment for nearby arena owners. Customer information is never shown here.</p>
      {message && <p className="mt-4 text-sm text-court-primary">{message}</p>}
      {error && <p className="mt-4 text-sm text-court-danger">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-6 mt-8">
        <form onSubmit={saveProfile} className="rounded-xl border border-court-line bg-white p-5 space-y-3">
          <div>
            <h2 className="font-display font-semibold text-xl">Shop and payment details</h2>
            <p className="mt-1 text-xs text-court-ink/50">Arena owners see these details only after they open your equipment catalog or place an order.</p>
          </div>
          <input required placeholder="Shop name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="input-field" />
          <input required placeholder="Shop address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className="input-field" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input required placeholder="City" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} className="input-field" />
            <input required placeholder="Shop phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="input-field" />
          </div>
          <input placeholder="UPI ID (optional)" value={profile.upiId} onChange={(e) => setProfile({ ...profile, upiId: e.target.value })} className="input-field" />
          <input type="url" placeholder="Payment link (optional)" value={profile.paymentLink} onChange={(e) => setProfile({ ...profile, paymentLink: e.target.value })} className="input-field" />
          <textarea placeholder="Payment instructions (optional)" rows={2} value={profile.paymentInstructions} onChange={(e) => setProfile({ ...profile, paymentInstructions: e.target.value })} className="input-field" />
          <div>
            <label className="block text-sm font-medium mb-1">UPI payment QR (optional)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPaymentQr(e.target.files?.[0] || null)} className="block w-full text-sm text-court-ink/60" />
            {profile.paymentQrUrl && !paymentQr && <img src={mediaUrl(profile.paymentQrUrl)} alt="Current payment QR" className="mt-2 h-28 w-28 rounded-lg border border-court-line object-contain" />}
          </div>
          <button className="w-full py-2.5 rounded-full bg-court-primary text-white text-sm font-semibold hover:bg-court-primary-dark">Save shop details</button>
        </form>

        <form onSubmit={addItem} className="rounded-xl border border-court-line bg-white p-5 space-y-3">
          <div>
            <h2 className="font-display font-semibold text-xl">Add equipment for sale</h2>
            <p className="mt-1 text-xs text-court-ink/50">Only arena owners can browse and purchase this inventory.</p>
          </div>
          <input required placeholder="Equipment name (e.g. Cricket bat)" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} className="input-field" />
          <input required placeholder="Sport" value={itemForm.sport} onChange={(e) => setItemForm({ ...itemForm, sport: e.target.value })} className="input-field" />
          <textarea placeholder="Description" rows={2} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} className="input-field" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input required min="0" type="number" placeholder="Price (₹)" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} className="input-field" />
            <input required min="0" step="1" type="number" placeholder="Available quantity" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} className="input-field" />
          </div>
          <button className="w-full py-2.5 rounded-full bg-court-primary text-white text-sm font-semibold hover:bg-court-primary-dark">Add equipment</button>
        </form>
      </div>

      <section className="mt-10">
        <h2 className="font-display font-semibold text-xl">My available equipment</h2>
        {items.length === 0 ? <p className="mt-2 text-sm text-court-ink/50">No equipment has been added yet.</p> : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {items.map((item) => <div key={item._id} className="rounded-xl border border-court-line bg-white p-4"><p className="font-semibold">{item.name}</p><p className="text-sm text-court-ink/60 capitalize">{item.sport}</p><p className="mt-2 text-sm">₹{item.price} · <span className="font-medium">{item.quantity} available</span></p></div>)}
          </div>
        )}
      </section>

      <section className="mt-12 pb-12">
        <h2 className="font-display font-semibold text-xl">Arena-owner orders</h2>
        <p className="mt-1 text-sm text-court-ink/60">Only the purchasing arena owner’s contact and delivery-arena details are listed. Set an expected delivery date so the owner can track when equipment will arrive.</p>
        {orders.length === 0 ? <p className="mt-3 text-sm text-court-ink/50">No purchases yet.</p> : (
          <div className="mt-4 space-y-3">
            {orders.map((order) => {
              const currentStatus = order.fulfillmentStatus || 'placed';
              const update = deliveryUpdates[order._id] || {};
              const deliveryDate = update.estimatedDeliveryDate ?? toDateInput(order.estimatedDeliveryDate);
              return (
                <article key={order._id} className="rounded-xl border border-court-line bg-white p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <p className="font-semibold">{order.itemName} × {order.quantity} · ₹{order.amount}</p>
                      <p className="text-sm text-court-ink/60">{order.buyerId?.name} · {order.buyerId?.email} · {order.buyerId?.phone}</p>
                      <p className="text-sm text-court-ink/60">For {order.deliveryArenaId?.name}, {order.deliveryArenaId?.location?.city} · ordered {new Date(order.createdAt).toLocaleDateString('en-IN')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-court-primary/10 text-court-primary font-medium">{order.paymentMethod === 'cash_on_delivery' ? 'Cash on delivery' : 'UPI'}</span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-court-ink/10 text-court-ink/70 font-medium">{paymentLabel[order.paymentStatus] || 'UPI payment pending'}</span>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-court-ink/10 text-court-ink/70 font-medium">{fulfillmentLabel[currentStatus]}</span>
                      {order.paymentMethod === 'upi' && order.paymentStatus === 'submitted' && <button type="button" onClick={() => confirmPayment(order._id)} className="text-sm font-semibold text-court-primary hover:underline">Confirm UPI payment</button>}
                    </div>
                  </div>

                  {!['delivered', 'cancelled'].includes(currentStatus) && (
                    <div className="mt-4 grid gap-2 rounded-lg bg-court-primary/5 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="text-xs font-medium text-court-ink/60">Delivery progress
                        <select value={update.fulfillmentStatus || currentStatus} onChange={(e) => setDeliveryUpdates((all) => ({ ...all, [order._id]: { ...all[order._id], fulfillmentStatus: e.target.value } }))} className="mt-1 block w-full rounded-lg border border-court-line bg-white px-2 py-2 text-sm text-court-ink">
                          {(nextFulfillmentStatuses[currentStatus] || [currentStatus]).map((status) => <option key={status} value={status}>{fulfillmentLabel[status]}</option>)}
                        </select>
                      </label>
                      <label className="text-xs font-medium text-court-ink/60">Expected delivery date
                        <input type="date" min={new Date().toLocaleDateString('en-CA')} value={deliveryDate} onChange={(e) => setDeliveryUpdates((all) => ({ ...all, [order._id]: { ...all[order._id], estimatedDeliveryDate: e.target.value } }))} className="mt-1 block w-full rounded-lg border border-court-line bg-white px-2 py-2 text-sm text-court-ink" />
                      </label>
                      <button type="button" onClick={() => updateDelivery(order)} className="rounded-full bg-court-primary px-4 py-2 text-sm font-semibold text-white hover:bg-court-primary-dark">Update order</button>
                    </div>
                  )}
                  {order.estimatedDeliveryDate && <p className="mt-3 text-sm text-court-primary">Expected arrival: {new Date(order.estimatedDeliveryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  {order.paymentMethod === 'cash_on_delivery' && currentStatus !== 'delivered' && <p className="mt-2 text-xs text-court-ink/55">Collect ₹{order.amount} on delivery. It will be marked paid once you mark this order delivered.</p>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default ShopkeeperDashboard;
