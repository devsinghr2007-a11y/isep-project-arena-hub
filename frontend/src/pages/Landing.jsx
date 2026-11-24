import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getArenas } from '../api/services';
import ArenaCard from '../components/ArenaCard';

const SPORTS = ['Cricket', 'Football', 'Badminton', 'Tennis', 'Basketball', 'Swimming'];

const Landing = () => {
  const navigate = useNavigate();
  const [city, setCity] = useState('');
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getArenas()
      .then(({ data }) => setFeatured(data.slice(0, 6)))
      .catch(() => setFeatured([]))
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    navigate(`/search${city ? `?city=${encodeURIComponent(city)}` : ''}`);
  };

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <p className="signal-label">ARENAHUB / FIND YOUR GAME</p>
            <h1 className="landing-title font-display font-bold">The city is your <em>home ground.</em></h1>
            <p className="landing-copy">Find real arenas, reserve a court, rent what you need, and pay securely — all from one place.</p>

          <form onSubmit={handleSearch} className="arena-search flex flex-col sm:flex-row gap-2">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Search by city, e.g. Bengaluru"
              className="flex-1 px-5 py-3.5 text-court-ink placeholder:text-court-ink/40 focus:outline-none"
            />
            <button
              type="submit"
              className="px-7 py-3.5 font-bold transition-colors"
            >
              Explore arenas ↗
            </button>
          </form>
          </div>
          <aside className="hero-panel">
            <small>LIVE ARENA NETWORK</small>
            <strong>From first search<br />to final whistle.</strong>
            <p>Rated courts, equipment rentals and secure booking, designed for every player and owner.</p>
            <div className="hero-stat-row"><div><span>Discover</span><b>Verified arenas</b></div><div><span>Reserve</span><b>Your best slot</b></div></div>
          </aside>
        </div>
      </section>

      <section className="market-section">
        <p className="section-kicker">CHOOSE YOUR PLAY</p>
        <h2 className="section-heading font-display font-semibold">Every sport. One starting line.</h2>
        <div className="flex flex-wrap gap-3">
          {SPORTS.map((sport) => (
            <button
              key={sport}
              onClick={() => navigate(`/search?sport=${encodeURIComponent(sport)}`)}
              className="sport-chip mt-6 px-5 py-2.5 rounded-md border bg-white font-medium text-sm transition-colors"
            >
              {sport}
            </button>
          ))}
        </div>
      </section>

      <section className="market-section pt-0">
        <div className="flex items-baseline justify-between mb-5">
          <div><p className="section-kicker">READY TO PLAY</p><h2 className="section-heading font-display font-semibold">High-rated arenas.</h2></div>
          <a href="/search" className="text-sm text-court-accent font-medium hover:underline">View all arenas ↗</a>
        </div>

        {loading ? (
          <p className="text-court-ink/50 text-sm">Loading arenas…</p>
        ) : featured.length === 0 ? (
          <p className="text-court-ink/50 text-sm">No approved arenas yet — check back soon.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((arena) => <ArenaCard key={arena._id} arena={arena} />)}
          </div>
        )}
      </section>
    </div>
  );
};

export default Landing;
