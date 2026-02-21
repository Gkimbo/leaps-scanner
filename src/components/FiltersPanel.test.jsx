/**
 * FiltersPanel Component Tests
 *
 * Tests for the filter controls including:
 * - Slider rendering and values
 * - Filter change callbacks
 * - Reset functionality
 * - Active filters display
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../test/utils';
import userEvent from '@testing-library/user-event';
import FiltersPanel from './FiltersPanel';
import { defaultFilters } from '../test/mocks/optionsData';

describe('FiltersPanel Component', () => {
  const mockOnFilterChange = vi.fn();
  const mockOnReset = vi.fn();

  const defaultProps = {
    filters: defaultFilters,
    onFilterChange: mockOnFilterChange,
    onReset: mockOnReset
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the filters header', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('should render all four filter sliders', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByText('Minimum Delta')).toBeInTheDocument();
      expect(screen.getByText('Maximum Price ($)')).toBeInTheDocument();
      expect(screen.getByText('Min Open Interest')).toBeInTheDocument();
      expect(screen.getByText('Min Days to Expiry')).toBeInTheDocument();
    });

    it('should display current filter values', () => {
      render(<FiltersPanel {...defaultProps} />);

      // Check delta value is displayed
      expect(screen.getByText('0.80')).toBeInTheDocument();

      // Check price value is displayed
      expect(screen.getByText('$5.00')).toBeInTheDocument();

      // Check days value is displayed
      expect(screen.getByText('365 days')).toBeInTheDocument();
    });

    it('should render reset button', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
    });

    it('should render active criteria badges', () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByText('Active Criteria:')).toBeInTheDocument();
      expect(screen.getByText(/Delta ≥ 0.80/)).toBeInTheDocument();
      expect(screen.getByText(/Price ≤ \$5.00/)).toBeInTheDocument();
      expect(screen.getByText(/DTE ≥ 365/)).toBeInTheDocument();
    });

    it('should render slider range labels', () => {
      render(<FiltersPanel {...defaultProps} />);

      // Delta range
      expect(screen.getByText('0.50')).toBeInTheDocument();
      expect(screen.getByText('0.99')).toBeInTheDocument();

      // Price range
      expect(screen.getByText('$0.50')).toBeInTheDocument();
      expect(screen.getByText('$20.00')).toBeInTheDocument();

      // Days range
      expect(screen.getByText('6 months')).toBeInTheDocument();
      expect(screen.getByText('2 years')).toBeInTheDocument();
    });
  });

  describe('Slider Interactions', () => {
    it('should have range inputs with correct attributes', () => {
      render(<FiltersPanel {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(4);

      // Delta slider
      expect(sliders[0]).toHaveAttribute('min', '0.5');
      expect(sliders[0]).toHaveAttribute('max', '0.99');
      expect(sliders[0]).toHaveAttribute('step', '0.01');

      // Price slider
      expect(sliders[1]).toHaveAttribute('min', '0.5');
      expect(sliders[1]).toHaveAttribute('max', '20');
      expect(sliders[1]).toHaveAttribute('step', '0.5');

      // Open Interest slider
      expect(sliders[2]).toHaveAttribute('min', '0');
      expect(sliders[2]).toHaveAttribute('max', '50000');
      expect(sliders[2]).toHaveAttribute('step', '500');

      // Days slider
      expect(sliders[3]).toHaveAttribute('min', '180');
      expect(sliders[3]).toHaveAttribute('max', '730');
      expect(sliders[3]).toHaveAttribute('step', '30');
    });

    it('should call onFilterChange when delta slider changes', () => {
      render(<FiltersPanel {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '0.90' } });

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minDelta: 0.9
      });
    });

    it('should call onFilterChange when price slider changes', () => {
      render(<FiltersPanel {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[1], { target: { value: '10' } });

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilters,
        maxPrice: 10
      });
    });

    it('should call onFilterChange when open interest slider changes', () => {
      render(<FiltersPanel {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[2], { target: { value: '5000' } });

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minOpenInterest: 5000
      });
    });

    it('should call onFilterChange when days slider changes', () => {
      render(<FiltersPanel {...defaultProps} />);

      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[3], { target: { value: '540' } });

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        ...defaultFilters,
        minDaysToExpiration: 540
      });
    });
  });

  describe('Reset Functionality', () => {
    it('should call onReset when reset button is clicked', async () => {
      const user = userEvent.setup();
      render(<FiltersPanel {...defaultProps} />);

      const resetButton = screen.getByRole('button', { name: /reset/i });
      await user.click(resetButton);

      expect(mockOnReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dynamic Filter Values', () => {
    it('should reflect updated filter values', () => {
      const customFilters = {
        minDelta: 0.95,
        maxPrice: 2.5,
        minOpenInterest: 10000,
        minDaysToExpiration: 500
      };

      render(
        <FiltersPanel
          {...defaultProps}
          filters={customFilters}
        />
      );

      // Check updated values are displayed
      expect(screen.getByText('0.95')).toBeInTheDocument();
      expect(screen.getByText('$2.50')).toBeInTheDocument();
      expect(screen.getByText('10,000')).toBeInTheDocument();
      expect(screen.getByText('500 days')).toBeInTheDocument();
    });

    it('should update active criteria badges with new values', () => {
      const customFilters = {
        minDelta: 0.88,
        maxPrice: 3.0,
        minOpenInterest: 5000,
        minDaysToExpiration: 400
      };

      render(
        <FiltersPanel
          {...defaultProps}
          filters={customFilters}
        />
      );

      expect(screen.getByText(/Delta ≥ 0.88/)).toBeInTheDocument();
      expect(screen.getByText(/Price ≤ \$3.00/)).toBeInTheDocument();
      expect(screen.getByText(/OI ≥ 5,000/)).toBeInTheDocument();
      expect(screen.getByText(/DTE ≥ 400/)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible sliders', () => {
      render(<FiltersPanel {...defaultProps} />);

      // All sliders should be in the document
      const sliders = screen.getAllByRole('slider');
      expect(sliders).toHaveLength(4);
      sliders.forEach(slider => {
        expect(slider).toBeInTheDocument();
      });
    });

    it('should have accessible reset button', () => {
      render(<FiltersPanel {...defaultProps} />);

      const resetButton = screen.getByRole('button', { name: /reset/i });
      expect(resetButton).toBeEnabled();
    });
  });
});
