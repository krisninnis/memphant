import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders loading state', () => {
  render(<App />);
  expect(screen.getByText(/Loading projects/i)).toBeInTheDocument();
});
