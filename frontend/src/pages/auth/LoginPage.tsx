import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EnvelopeSimple, LockKey, ArrowRight, CircleNotch, ShieldCheck } from '@phosphor-icons/react';
import api from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  passwordRaw: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    try {
      const res = await api.post('/auth/login', { email: data.email, passwordRaw: data.passwordRaw });
      const result = res.data.data;
      setAuth(result.token, result.user);
      const role = result.user.role;

      if (['SUPER_ADMIN', 'ADMIN'].includes(role)) navigate('/admin/users');
      else if (role === 'DISPATCHER') navigate('/dashboard');
      else if (role === 'WATCHER') navigate('/watcher/new-incident');
      else if (role === 'PARTNER') navigate('/partner/dashboard');
      else navigate('/unauthorized');
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      setServerError(msg || 'Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Co-branded header */}
        <div className="login-cobrand">
          <img src="/nccg.png" alt="Nairobi City County" style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
          <span className="login-cobrand-div" />
          <img src="/Malteser.png" alt="Malteser International" style={{ height: 38, width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Form body */}
        <div className="login-body">
          <div className="login-kicker">Emergency Operations Platform</div>
          <h1 className="login-title">Sign in</h1>
          <p className="login-sub">Nairobi City County emergency dispatch console.</p>

          {serverError && (
            <div className="pill pill-red" style={{ borderRadius: 8, padding: '10px 14px', marginBottom: 18, display: 'flex', gap: 8, fontSize: 13 }}>
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="col" style={{ gap: 16 }}>
            <div className="field">
              <label className="label">Work email</label>
              <div className="input-icon">
                <EnvelopeSimple size={16} />
                <input
                  {...register('email')}
                  className="input"
                  type="email"
                  autoComplete="username"
                  placeholder="dispatcher@eoc.nairobi.go.ke"
                  style={errors.email ? { borderColor: 'var(--red)' } : undefined}
                />
              </div>
              {errors.email && (
                <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors.email.message}</span>
              )}
            </div>

            <div className="field">
              <label className="label">Password</label>
              <div className="input-icon">
                <LockKey size={16} />
                <input
                  {...register('passwordRaw')}
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  style={errors.passwordRaw ? { borderColor: 'var(--red)' } : undefined}
                />
              </div>
              {errors.passwordRaw && (
                <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors.passwordRaw.message}</span>
              )}
            </div>

            <button
              className="btn btn-primary btn-block btn-lg"
              disabled={isSubmitting}
              type="submit"
              style={{ marginTop: 4 }}
            >
              {isSubmitting ? (
                <><CircleNotch size={18} className="spin" /> Signing in…</>
              ) : (
                <>Sign in <ArrowRight size={16} weight="bold" /></>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="login-foot">
          <ShieldCheck size={15} weight="fill" />
          Authorized personnel only · All activity is logged and audited
        </div>
      </div>

      <p className="login-copy">© {new Date().getFullYear()} Nairobi City County Government · In partnership with Malteser International</p>
    </div>
  );
}
