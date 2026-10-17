import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the app title in Turkish', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'SDS Hazırlama Sistemi' })).toBeInTheDocument();
  });
});
