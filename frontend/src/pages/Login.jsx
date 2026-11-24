import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const dashboardPath = { customer: '/dashboard', arena_owner: '/owner', shop_keeper: '/shop', admin: '/admin' };

const Login = () => {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(form.email, form.password);
      navigate(location.state?.from || dashboardPath[user.role] || '/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <p className="signal-label">PLAYER ACCESS</p>
        <h1>Welcome<br />back to the <em>game.</em></h1>
        <p>Your bookings, equipment rentals, and arena updates are waiting on the other side.</p>
      </aside>
      <section className="auth-workspace"><div className="auth-card">
      <p className="signal-label">SIGN IN</p>
      <h2 className="font-display font-bold mt-3">Log in</h2>
      <p className="text-court-ink/60 mt-2 text-sm">Welcome back — book your next slot.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            type="email" required value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line focus:outline-none focus:ring-2 focus:ring-court-primary"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            type="password" required value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="mt-1 w-full px-4 py-3 rounded-xl border border-court-line focus:outline-none focus:ring-2 focus:ring-court-primary"
          />
        </div>

        {error && <p className="text-sm text-court-danger">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full py-3.5 rounded-full bg-court-primary text-white font-semibold hover:bg-court-primary-dark transition-colors disabled:opacity-60"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="text-sm text-court-ink/60 mt-6">
        New to ArenaHub? <Link to="/register" className="text-court-primary font-medium hover:underline">Create an account</Link>
      </p>
      </div></section>
    </div>
  );
};

export default Login;
