import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types/api';

interface AuthStore {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setRole: (role: User['role']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setRole: (role) => set((s) => ({ user: s.user ? { ...s.user, role } : null })),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'nccg-eoc-auth' }
  )
);
