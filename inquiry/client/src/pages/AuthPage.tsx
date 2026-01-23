import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

function Logo() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-12 h-12"
    >
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke="currentColor"
        strokeWidth="3"
        className="text-charcoal-900"
      />
      <text
        x="24"
        y="32"
        textAnchor="middle"
        className="text-charcoal-900"
        style={{ fontSize: '24px', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}
        fill="currentColor"
      >
        ?
      </text>
    </svg>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { signup, login, isLoading, error, clearError } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');

  const toggleMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    clearError();
    setEmail('');
    setPassword('');
    setFirstName('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await signup(email, password, firstName);
      }
      navigate('/');
    } catch {
      // Error is handled in store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-charcoal-50 p-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          {/* Logo and Title */}
          <div className="flex flex-col items-center mb-8">
            <Logo />
            <h1 className="mt-4 text-2xl font-semibold text-charcoal-900">
              Inquiry
            </h1>
            <p className="mt-2 text-charcoal-500 text-center">
              {mode === 'login'
                ? 'Sign in to continue'
                : 'Create your account'}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="firstName" className="label">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input"
                  placeholder="Enter your first name"
                  required
                  disabled={isLoading}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="Enter your email"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder={mode === 'signup' ? 'Min 8 characters' : 'Enter your password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Toggle Mode */}
          <p className="mt-6 text-center text-sm text-charcoal-500">
            {mode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="link font-medium"
                  disabled={isLoading}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={toggleMode}
                  className="link font-medium"
                  disabled={isLoading}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
