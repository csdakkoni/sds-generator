import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

describe('App', () => {
  it('asks a signed-out visitor to sign in, in Turkish', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'SDS Hazırlama Sistemi' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });
});
