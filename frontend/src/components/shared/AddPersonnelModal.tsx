import { useState } from 'react';
import {
  X,
  UserPlus,
  Envelope,
  Lock,
  Phone,
  ShieldCheck,
  Globe,
  Info,
  IdentificationCard,
  Briefcase,
} from '@phosphor-icons/react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { useNotificationStore } from '../../stores/notificationStore';
import { Agency, Role } from '../../types/api';

interface AddPersonnelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'WATCHER',
  'DISPATCHER',
  'PARTNER',
  'DRIVER',
  'EMT',
  'NURSE',
];

const DEFAULT_ROLE: Role = 'WATCHER';

export default function AddPersonnelModal({ isOpen, onClose }: AddPersonnelModalProps) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    passwordRaw: '',
    phone: '',
    role: DEFAULT_ROLE,
    roles: [DEFAULT_ROLE] as Role[],
    agencyId: '',
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ['admin', 'agencies'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return res.data.data as Agency[];
    },
    enabled: isOpen,
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      passwordRaw: '',
      phone: '',
      role: DEFAULT_ROLE,
      roles: [DEFAULT_ROLE],
      agencyId: '',
    });
  };

  const toggleRole = (role: Role) => {
    setFormData((prev) => {
      const selected = prev.roles.includes(role);
      const nextRoles = selected
        ? prev.roles.filter((item) => item !== role)
        : [...prev.roles, role];

      const safeRoles = nextRoles.length ? nextRoles : [DEFAULT_ROLE];

      return {
        ...prev,
        roles: safeRoles,
        role: safeRoles[0],
      };
    });
  };

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return api.post('/admin/users', {
        ...data,
        role: data.roles[0],
        roles: data.roles,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      addNotification({
        type: 'success',
        title: 'Personnel Enlisted',
        message: `${formData.name} has been added to the tactical roster.`,
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      addNotification({
        type: 'error',
        title: 'Enlistment Failed',
        message:
          error.response?.data?.message ||
          'Failed to create user. Please check the data and try again.',
      });
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      <div className="relative bg-white w-full max-w-2xl rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/20">
        <div className="bg-brand-sidebar p-6 flex justify-between items-center border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="bg-brand-green p-2.5 rounded-xl">
              <UserPlus size={22} weight="fill" className="text-black" />
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg leading-none">Add Personnel</h3>
              <p className="text-slate-400 text-xs mt-1">Register a new staff member</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-all"
            type="button"
          >
            <X size={24} weight="bold" className="group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <form
          className="p-10 flex flex-col gap-8 bg-gradient-to-b from-white to-slate-50/50"
          onSubmit={(event) => {
            event.preventDefault();

            if (!formData.agencyId) {
              addNotification({
                type: 'error',
                title: 'Data Missing',
                message: 'Please select an agency.',
              });
              return;
            }

            if (!formData.roles.length) {
              addNotification({
                type: 'error',
                title: 'Role Missing',
                message: 'Please assign at least one role.',
              });
              return;
            }

            mutation.mutate(formData);
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <IdentificationCard size={16} weight="bold" className="text-brand-teal" />
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                  Identity Data
                </h4>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    Full Name
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-sans text-sm font-black text-brand-teal focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal outline-none transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    <Envelope size={14} weight="bold" /> Email Address
                  </label>
                  <input
                    required
                    type="email"
                    placeholder="e.g. j.doe@nms.go.ke"
                    value={formData.email}
                    onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-sans text-sm font-black text-brand-teal focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal outline-none transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    <Lock size={14} weight="bold" /> Secure Password
                  </label>
                  <input
                    required
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={formData.passwordRaw}
                    onChange={(event) =>
                      setFormData({ ...formData, passwordRaw: event.target.value })
                    }
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-sans text-sm font-bold text-slate-500 focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal outline-none transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={16} weight="bold" className="text-brand-green" />
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
                  Tactical Authorization
                </h4>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    <Globe size={14} weight="bold" /> Assigned Agency
                  </label>
                  <select
                    required
                    className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-4 font-sans text-xs font-black text-brand-teal outline-none focus:ring-4 focus:ring-brand-teal/10 appearance-none shadow-sm"
                    value={formData.agencyId}
                    onChange={(event) =>
                      setFormData({ ...formData, agencyId: event.target.value })
                    }
                  >
                    <option value="">Select Agency...</option>
                    {agencies.map((agency) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    <Briefcase size={14} weight="bold" /> Operational Roles
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((role) => {
                      const selected = formData.roles.includes(role);

                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleRole(role)}
                          className={`rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                            selected
                              ? 'bg-brand-green border-brand-green text-brand-sidebar shadow-md'
                              : 'bg-white border-slate-200 text-slate-400 hover:border-brand-green/50'
                          }`}
                        >
                          {role.replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5 ml-1">
                    <Phone size={14} weight="bold" /> Tactical Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+254..."
                    value={formData.phone}
                    onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 font-sans text-sm font-bold text-slate-500 focus:ring-4 focus:ring-brand-teal/10 focus:border-brand-teal outline-none transition-all shadow-sm placeholder:text-slate-300"
                  />
                </div>

                <div className="bg-brand-teal/5 border border-brand-teal/10 rounded-2xl p-4 flex gap-3">
                  <Info size={20} weight="fill" className="text-brand-teal shrink-0" />
                  <p className="text-[10px] font-bold text-brand-teal/70 leading-relaxed uppercase tracking-tight">
                    Personnel can now receive multiple operational roles and switch between role
                    centers after login.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="bg-slate-100 p-2 rounded-lg">
                <ShieldCheck size={18} weight="bold" className="text-slate-400" />
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Auth Protocol: Level 4 Active
              </span>
            </div>

            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-10 py-5 bg-brand-green text-brand-sidebar font-black text-xs uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-brand-green/30 hover:bg-brand-sidebar hover:text-white transition-all active:scale-[0.96] flex items-center gap-4 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-brand-sidebar/30 border-t-brand-sidebar rounded-full animate-spin" />
                  Enlisting...
                </>
              ) : (
                <>
                  Enlist Personnel
                  <UserPlus size={18} weight="fill" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
