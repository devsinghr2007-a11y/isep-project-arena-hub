import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const dashboardPath = { customer: '/dashboard', arena_owner: '/owner', shop_keeper: '/shop' };
const errorMessage = (err, fallback) => err.response?.data?.message || err.message || fallback;

const Register = () => {
  const { sendRegistrationOtp, completeRegistration, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'customer' });
  const [emailOtp, setEmailOtp] = useState('');
  const [step, setStep] = useState('details');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const requestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    try {
      const { message } = await sendRegistrationOtp(form);
      setStep('verify');
      setNotice(message);
    } catch (err) {
      setError(errorMessage(err, 'Unable to send the email verification code.'));
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');

    try {
      const user = await completeRegistration({ email: form.email, emailOtp });
      navigate(dashboardPath[user.role] || '/');
    } catch (err) {
      setError(errorMessage(err, 'Unable to verify your email code.'));
    }
  };

  const resendOtp = async () => {
    setError('');
    setNotice('');

    try {
      const { message } = await sendRegistrationOtp(form);
      setEmailOtp('');
      setNotice(message);
    } catch (err) {
      setError(errorMessage(err, 'Unable to send a new verification code.'));
    }
  };

  const editDetails = () => {
    setStep('details');
    setEmailOtp('');
    setError('');
    setNotice('');
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <p className="signal-label">JOIN ARENAHUB</p>
        <h1>Build your<br /><em>home ground.</em></h1>
        <p>Whether you play, own an arena, or run a sports shop, ArenaHub gives your game one place to grow.</p>
      </aside>
      <section className="auth-workspace"><div className="auth-card">
      <p className="signal-label">ACCOUNT SETUP</p>
      <h2 className="font-display font-bold mt-3">
        {step === 'details' ? 'Create your account' : 'Verify your email'}
      </h2>
      <p className="text-court-ink/60 mt-2 text-sm">
        {step === 'details'
          ? 'Book courts as a player, list an arena, or sell sports equipment to arena owners.'
          : 'Enter the code sent to your email address.'}
      </p>

      {step === 'details' ? (
        <>
          <div className="mt-6 grid grid-cols-3 rounded-full border border-court-line p-1 bg-white">
            {[['customer', 'Customer'], ['arena_owner', 'Arena Owner'], ['shop_keeper', 'Shopkeeper']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm({ ...form, role: value })}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition-colors ${
                  form.role === value ? 'bg-court-primary text-white' : 'text-court-ink/60 hover:text-court-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={requestOtp} className="mt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Full name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line focus:outline-none focus:ring-2 focus:ring-court-primary" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line focus:outline-none focus:ring-2 focus:ring-court-primary" />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input type="tel" required inputMode="tel" placeholder="+91 7382638912" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line focus:outline-none focus:ring-2 focus:ring-court-primary" />
              <p className="mt-1 text-xs text-court-ink/50">Your number is saved to your profile. Email verification is used during signup.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input type="password" required minLength={6} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line focus:outline-none focus:ring-2 focus:ring-court-primary" />
            </div>

            {error && <p className="text-sm text-court-danger">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-full bg-court-primary text-white font-semibold hover:bg-court-primary-dark transition-colors disabled:opacity-60">
              {loading ? 'Sending code…' : 'Send email verification code'}
            </button>
          </form>
        </>
      ) : (
        <form onSubmit={verifyOtp} className="mt-6 space-y-4">
          <div className="rounded-xl border border-court-line bg-white p-4 text-sm text-court-ink/70">
            A verification code was sent to <span className="font-medium text-court-ink">{form.email}</span>.
          </div>
          <div>
            <label className="text-sm font-medium">Email verification code</label>
            <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              placeholder="6-digit code" value={emailOtp} onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
              className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line tracking-[0.35em] focus:outline-none focus:ring-2 focus:ring-court-primary" />
          </div>

          {notice && <p className="text-sm text-court-primary">{notice}</p>}
          {error && <p className="text-sm text-court-danger">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-full bg-court-primary text-white font-semibold hover:bg-court-primary-dark transition-colors disabled:opacity-60">
            {loading ? 'Verifying…' : 'Verify email and create account'}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={editDetails} className="text-court-ink/60 hover:text-court-ink hover:underline">Edit details</button>
            <button type="button" onClick={resendOtp} disabled={loading} className="text-court-primary font-medium hover:underline disabled:opacity-60">Resend code</button>
          </div>
        </form>
      )}

      <p className="text-sm text-court-ink/60 mt-6">
        Already have an account? <Link to="/login" className="text-court-primary font-medium hover:underline">Log in</Link>
      </p>
      </div></section>
    </div>
  );
};

export default Register;
