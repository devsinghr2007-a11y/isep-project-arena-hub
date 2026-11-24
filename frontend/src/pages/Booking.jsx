import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getArenaById,
  getCourts,
  createBooking,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createCashfreeOrder,
  verifyCashfreePayment,
} from '../api/services';
import { useAuth } from '../context/AuthContext';

const Booking = () => {
  const { arenaId, courtId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [arena, setArena] = useState(null);
  const [court, setCourt] = useState(null);
  const [booking, setBooking] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | booking | paying | confirmed | error
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getArenaById(arenaId), getCourts({ arenaId })])
      .then(([a, c]) => {
        setArena(a.data);
        setCourt(c.data.find((ct) => ct._id === courtId) || null);
      })
      .finally(() => setLoading(false));
  }, [arenaId, courtId]);

  const openSlots = (court?.availableSlots || []).filter((s) => !s.isBooked);
  const slotsByDate = openSlots.reduce((acc, s) => {
    acc[s.date] = acc[s.date] || [];
    acc[s.date].push(s);
    return acc;
  }, {});

  const handleConfirm = async () => {
    if (!user) return navigate('/login', { state: { from: `/book/${arenaId}/${courtId}` } });
    if (!selectedSlot) return;

    setError('');
    setStatus('booking');
    try {
      let activeBooking = booking;
      if (!activeBooking) {
        const { data } = await createBooking({
          arenaId, courtId, date: selectedSlot.date, time: selectedSlot.time,
        });
        activeBooking = data;
        setBooking(data);
      }

      setStatus('paying');

      // 1. Try Razorpay checkout
      try {
        const { data: orderData } = await createRazorpayOrder({ bookingId: activeBooking._id });

        if (!window.Razorpay) {
          throw new Error('Razorpay Checkout SDK is not loaded. Please check your internet connection.');
        }

        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'ArenaHub',
          description: `Booking for ${court.name} at ${arena.name}`,
          order_id: orderData.orderId,
          handler: async function (response) {
            try {
              await verifyRazorpayPayment({
                bookingId: activeBooking._id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              setStatus('confirmed');
            } catch (verificationError) {
              setError(verificationError.response?.data?.message || 'Payment verification failed.');
              setStatus('idle');
            }
          },
          prefill: {
            name: user?.name || '',
            email: user?.email || '',
            contact: user?.phone || '',
          },
          theme: {
            color: '#10b981',
          },
          modal: {
            ondismiss: function () {
              setStatus('idle');
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          setError(resp.error?.description || 'Payment failed. Please try again.');
          setStatus('idle');
        });
        rzp.open();
        return;
      } catch (rzpErr) {
        // Fallback to Cashfree if Razorpay is unavailable or not configured
        const isNotConfigured = rzpErr.response?.status === 503;
        if (isNotConfigured && window.Cashfree) {
          const { data: orderData } = await createCashfreeOrder({ bookingId: activeBooking._id });
          const cashfree = window.Cashfree({ mode: orderData.environment });
          await cashfree.checkout({
            paymentSessionId: orderData.paymentSessionId,
            redirectTarget: '_modal',
          });

          try {
            await verifyCashfreePayment({ bookingId: activeBooking._id });
            setStatus('confirmed');
            return;
          } catch (verificationError) {
            setError(verificationError.response?.data?.message || 'Payment was not completed. You can try again.');
            setStatus('idle');
            return;
          }
        }
        throw rzpErr;
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Booking failed');
      setStatus('idle');
    }
  };

  if (loading) return <p className="max-w-3xl mx-auto px-6 py-16 text-court-ink/50 text-sm">Loading…</p>;
  if (!arena || !court) return <p className="max-w-3xl mx-auto px-6 py-16 text-court-ink/50 text-sm">Court not found.</p>;

  if (status === 'confirmed') {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <div className="w-14 h-14 rounded-full bg-court-primary/10 text-court-primary flex items-center justify-center mx-auto text-2xl font-display font-bold">✓</div>
        <h1 className="font-display font-bold text-2xl mt-5">Booking confirmed</h1>
        <p className="text-court-ink/60 mt-2 text-sm">
          {court.name} at {arena.name} · {selectedSlot.date} · {selectedSlot.time}
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="mt-8 px-6 py-3 rounded-full bg-court-primary text-white font-semibold hover:bg-court-primary-dark transition-colors"
        >
          View my bookings
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="font-display font-bold text-3xl">Book {court.name}</h1>
      <p className="text-court-ink/60 mt-1">{arena.name} · {arena.location?.city} · ₹{court.pricePerHour}/hr</p>

      <div className="mt-8">
        <h2 className="font-display font-semibold text-lg mb-3">Choose a slot</h2>
        {Object.keys(slotsByDate).length === 0 ? (
          <div className="p-4 rounded-xl border border-court-line bg-court-ink/5">
            <p className="text-sm font-medium text-court-ink/70">No open slots are available for this court right now.</p>
            <p className="text-xs text-court-ink/50 mt-1">Please check back later or choose another court.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(slotsByDate).map(([date, slots]) => (
              <div key={date}>
                <p className="text-sm font-semibold text-court-ink/70">{date}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {slots.map((s) => (
                    <button
                      key={s._id}
                      onClick={() => setSelectedSlot(s)}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                        selectedSlot?._id === s._id
                          ? 'bg-court-primary text-white border-court-primary'
                          : 'border-court-line hover:border-court-primary hover:text-court-primary'
                      }`}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-court-danger mt-4">{error}</p>}

      <button
        onClick={handleConfirm}
        disabled={!selectedSlot || status === 'booking' || status === 'paying'}
        className="mt-8 w-full sm:w-auto px-8 py-3.5 rounded-full bg-court-accent text-court-primary-dark font-semibold hover:bg-court-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {status === 'booking'
          ? 'Reserving slot…'
          : status === 'paying'
          ? 'Opening payment gateway…'
          : openSlots.length === 0
          ? 'No slots available'
          : !selectedSlot
          ? 'Select a slot above to pay'
          : `Confirm & pay ₹${court.pricePerHour} (${selectedSlot.date} · ${selectedSlot.time})`}
      </button>
    </div>
  );
};

export default Booking;
