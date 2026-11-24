import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBookings, getRentals, returnRental, createRazorpayOrder, verifyRazorpayPayment } from '../../api/services';

const statusStyles = {
  pending: 'bg-court-accent/20 text-court-accent-dark',
  confirmed: 'bg-court-primary/10 text-court-primary',
  cancelled: 'bg-court-danger/10 text-court-danger',
  completed: 'bg-court-ink/10 text-court-ink/60',
  active: 'bg-court-accent/20 text-court-accent-dark',
  returned: 'bg-court-ink/10 text-court-ink/60',
  overdue: 'bg-court-danger/10 text-court-danger',
};

const Badge = ({ status }) => (
  <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusStyles[status] || ''}`}>
    {status}
  </span>
);

const CustomerDashboard = () => {
  const [bookings, setBookings] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingBookingId, setPayingBookingId] = useState(null);
  const [paymentError, setPaymentError] = useState('');

  const load = () => Promise.all([getBookings(), getRentals()]).then(([b, r]) => {
    setBookings(b.data);
    setRentals(r.data);
  });

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const handleReturn = async (id) => {
    await returnRental(id);
    load();
  };

  const handlePayBooking = async (booking) => {
    setPaymentError('');
    setPayingBookingId(booking._id);
    try {
      const { data: orderData } = await createRazorpayOrder({ bookingId: booking._id });
      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout SDK is not loaded. Please refresh the page.');
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'ArenaHub',
        description: `Booking for ${booking.courtId?.name || 'Court'} at ${booking.arenaId?.name || 'Arena'}`,
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            await verifyRazorpayPayment({
              bookingId: booking._id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setPayingBookingId(null);
            load();
          } catch (verificationError) {
            setPaymentError(verificationError.response?.data?.message || 'Payment verification failed.');
            setPayingBookingId(null);
          }
        },
        prefill: {
          name: booking.userId?.name || '',
          email: booking.userId?.email || '',
          contact: booking.userId?.phone || '',
        },
        theme: {
          color: '#10b981',
        },
        modal: {
          ondismiss: function () {
            setPayingBookingId(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setPaymentError(resp.error?.description || 'Payment failed.');
        setPayingBookingId(null);
      });
      rzp.open();
    } catch (err) {
      setPaymentError(err.response?.data?.message || err.message || 'Payment initiation failed.');
      setPayingBookingId(null);
    }
  };

  if (loading) return <p className="max-w-5xl mx-auto px-6 py-16 text-court-ink/50 text-sm">Loading…</p>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="font-display font-bold text-3xl">My bookings</h1>

      {paymentError && (
        <div className="mt-4 p-4 rounded-xl border border-court-danger/30 bg-court-danger/10 text-court-danger text-sm">
          {paymentError}
        </div>
      )}

      <section className="mt-8">
        {bookings.length === 0 ? (
          <p className="text-sm text-court-ink/50">
            No bookings yet — <Link to="/search" className="text-court-primary font-medium hover:underline">find an arena</Link>.
          </p>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b._id} className="flex items-center justify-between rounded-xl border border-court-line bg-white p-4">
                <div>
                  <p className="font-semibold">{b.arenaId?.name} · {b.courtId?.name}</p>
                  <p className="text-sm text-court-ink/60">{b.date} · {b.time} · ₹{b.amount}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge status={b.status} />
                  {b.status === 'pending' && (
                    <button
                      onClick={() => handlePayBooking(b)}
                      disabled={payingBookingId === b._id}
                      className="px-4 py-1.5 text-xs rounded-full bg-court-accent text-court-primary-dark font-semibold hover:bg-court-accent-dark transition-colors disabled:opacity-50"
                    >
                      {payingBookingId === b._id ? 'Opening…' : 'Pay now'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <h2 className="font-display font-semibold text-xl mt-12">Equipment rentals</h2>
      <section className="mt-4">
        {rentals.length === 0 ? (
          <p className="text-sm text-court-ink/50">No equipment rentals yet.</p>
        ) : (
          <div className="space-y-3">
            {rentals.map((r) => (
              <div key={r._id} className="flex items-center justify-between rounded-xl border border-court-line bg-white p-4">
                <div>
                  <p className="font-semibold">{r.equipmentId?.name} × {r.quantity}</p>
                  <p className="text-sm text-court-ink/60">Return by {new Date(r.returnDate).toLocaleDateString()} · Deposit ₹{r.deposit}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge status={r.status} />
                  {r.status === 'active' && (
                    <button
                      onClick={() => handleReturn(r._id)}
                      className="text-sm font-medium text-court-primary hover:underline"
                    >
                      Mark returned
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default CustomerDashboard;
