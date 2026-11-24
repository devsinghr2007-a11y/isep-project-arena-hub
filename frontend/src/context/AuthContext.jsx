import { createContext, useContext, useState } from 'react';
import { loginUser, requestRegistrationOtp, verifyRegistrationOtp } from '../api/services';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('arenahub_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  const persist = (token, userData) => {
    localStorage.setItem('arenahub_token', token);
    localStorage.setItem('arenahub_user', JSON.stringify(userData));
    setUser(userData);
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await loginUser({ email, password });
      persist(data.token, data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const sendRegistrationOtp = async (payload) => {
    setLoading(true);
    try {
      const { data } = await requestRegistrationOtp(payload);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const completeRegistration = async (payload) => {
    setLoading(true);
    try {
      const { data } = await verifyRegistrationOtp(payload);
      persist(data.token, data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('arenahub_token');
    localStorage.removeItem('arenahub_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, sendRegistrationOtp, completeRegistration, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
