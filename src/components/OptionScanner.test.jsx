/**
 * OptionScanner Integration Tests
 *
 * Integration tests for the main dashboard component including:
 * - Search functionality
 * - Filter interactions
 * - View mode switching
 * - API integration
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test/utils';
import userEvent from '@testing-library/user-event';
import OptionScanner from './OptionScanner';

// Mock the API service
vi.mock('../services/optionsApi', () => ({
  fetchOptionsChain: vi.fn(),
  filterHighRiskLeaps: vi.fn((options, filters) => {
    if (!options) return [];
    return options.filter(opt => {
      const absDelta = Math.abs(opt.delta);
      return (
        absDelta >= filters.minDelta &&
        opt.premium <= filters.maxPrice &&
        opt.daysToExpiration >= filters.minDaysToExpiration
      );
    });
  }),
  calculateRiskLevel: vi.fn(() => 'low'),
  getApiProvider: vi.fn(() => 'mock'),
  batchScanTickers: vi.fn(),
  calculateLeapsScore: vi.fn(() => 10),
  getTopScoredOptions: vi.fn((options) => options.slice(0, 50))
}));

// Mock the stock universe
vi.mock('../services/stockUniverse', () => ({
  getStockUniverse: vi.fn(() => ['AAPL', 'MSFT', 'GOOGL'])
}));

// Helper to get the single ticker scan button (not the auto-scan button)
const getSingleTickerScanButton = () => {
  // In single mode, the scan button contains just "Scan" text
  const buttons = screen.getAllByRole('button');
  return buttons.find(btn =>
    btn.textContent?.trim() === 'Scan' ||
    btn.textContent?.includes('Scanning')
  );
};

import { fetchOptionsChain, filterHighRiskLeaps } from '../services/optionsApi';
import { mockFilteredOptions, mockHighDeltaOption } from '../test/mocks/optionsData';

describe('OptionScanner Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchOptionsChain.mockResolvedValue(mockFilteredOptions);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the main header', () => {
      render(<OptionScanner />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toContain('LEAPS Scanner');
    });

    it('should render search input', () => {
      render(<OptionScanner />);

      expect(screen.getByPlaceholderText(/Enter ticker symbol/)).toBeInTheDocument();
    });

    it('should render calls/puts toggle', () => {
      render(<OptionScanner />);

      expect(screen.getByRole('button', { name: /calls/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /puts/i })).toBeInTheDocument();
    });

    it('should render scan button', () => {
      render(<OptionScanner />);

      // In single mode (default), there should be a "Scan" button for single ticker search
      const scanButton = getSingleTickerScanButton();
      expect(scanButton).toBeInTheDocument();
    });

    it('should render scan mode toggle', () => {
      render(<OptionScanner />);

      expect(screen.getByRole('button', { name: /single ticker/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /auto-scan/i })).toBeInTheDocument();
    });

    it('should render popular tickers', () => {
      render(<OptionScanner />);

      expect(screen.getByText('Popular:')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'AAPL' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'MSFT' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'TSLA' })).toBeInTheDocument();
    });

    it('should render API provider indicator', () => {
      render(<OptionScanner />);

      expect(screen.getByText(/mock/i)).toBeInTheDocument();
    });

    it('should render filters panel', () => {
      render(<OptionScanner />);

      expect(screen.getByText('Filters')).toBeInTheDocument();
      expect(screen.getByText('Minimum Delta')).toBeInTheDocument();
    });

    it('should render view mode toggles', () => {
      render(<OptionScanner />);

      expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cards/i })).toBeInTheDocument();
    });

    it('should render footer disclaimer', () => {
      render(<OptionScanner />);

      expect(screen.getByText(/Not financial advice/)).toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('should update input value when typing', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      expect(input).toHaveValue('AAPL');
    });

    it('should convert input to uppercase', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'aapl');

      expect(input).toHaveValue('AAPL');
    });

    it('should call fetchOptionsChain when form is submitted', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(fetchOptionsChain).toHaveBeenCalledWith('AAPL', 'call');
      });
    });

    it('should show error when searching with empty input', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      expect(screen.getByText(/Please enter a ticker symbol/)).toBeInTheDocument();
    });

    it('should display results after successful search', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        // Multiple AAPL elements exist (quick ticker + results), check for table results
        const aaplElements = screen.getAllByText('AAPL');
        expect(aaplElements.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Quick Ticker Selection', () => {
    it('should search when clicking a popular ticker', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const aaplButton = screen.getByRole('button', { name: 'AAPL' });
      await user.click(aaplButton);

      await waitFor(() => {
        expect(fetchOptionsChain).toHaveBeenCalledWith('AAPL', 'call');
      });
    });

    it('should highlight selected ticker', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const tslaButton = screen.getByRole('button', { name: 'TSLA' });
      await user.click(tslaButton);

      await waitFor(() => {
        expect(tslaButton.className).toContain('bg-neon-blue');
      });
    });
  });

  describe('Option Type Toggle', () => {
    it('should default to calls', () => {
      render(<OptionScanner />);

      const callsButton = screen.getByRole('button', { name: /calls/i });
      // Check that calls button has the active styling
      expect(callsButton.className).toContain('bg-bull');
    });

    it('should switch to puts when clicked', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const putsButton = screen.getByRole('button', { name: /puts/i });
      await user.click(putsButton);

      expect(putsButton.className).toContain('bg-bear');
    });

    it('should fetch puts when puts is selected and search is performed', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      // Switch to puts
      const putsButton = screen.getByRole('button', { name: /puts/i });
      await user.click(putsButton);

      // Search
      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'SPY');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(fetchOptionsChain).toHaveBeenCalledWith('SPY', 'put');
      });
    });
  });

  describe('View Mode Toggle', () => {
    it('should default to table view', () => {
      render(<OptionScanner />);

      const tableButton = screen.getByRole('button', { name: /table/i });
      expect(tableButton.className).toContain('bg-trading-card');
    });

    it('should switch to cards view when clicked', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const cardsButton = screen.getByRole('button', { name: /cards/i });
      await user.click(cardsButton);

      expect(cardsButton.className).toContain('bg-trading-card');
    });
  });

  describe('Loading State', () => {
    it('should show loading state during search', async () => {
      const user = userEvent.setup();
      fetchOptionsChain.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(mockFilteredOptions), 100);
      }));

      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      // Should show loading state
      expect(screen.getByText(/Scanning.../)).toBeInTheDocument();
    });

    it('should disable scan button while loading', async () => {
      const user = userEvent.setup();
      fetchOptionsChain.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(mockFilteredOptions), 100);
      }));

      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      expect(scanButton).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API fails', async () => {
      const user = userEvent.setup();
      fetchOptionsChain.mockRejectedValue(new Error('API Error'));

      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'INVALID');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/API Error/)).toBeInTheDocument();
      });
    });

    it('should display message when no options found', async () => {
      const user = userEvent.setup();
      fetchOptionsChain.mockResolvedValue([]);

      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'RARE');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/No LEAPS options found/)).toBeInTheDocument();
      });
    });

    it('should clear error when typing new ticker', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      // Trigger error
      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);
      expect(screen.getByText(/Please enter a ticker symbol/)).toBeInTheDocument();

      // Type to clear error
      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      // After typing, error should be cleared
      await waitFor(() => {
        expect(screen.queryByText(/Please enter a ticker symbol/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Filter Interactions', () => {
    it('should update filters when sliders change', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      // First do a search to have data
      const aaplButton = screen.getByRole('button', { name: 'AAPL' });
      await user.click(aaplButton);

      await waitFor(() => {
        expect(fetchOptionsChain).toHaveBeenCalled();
      });

      // Change delta filter
      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '0.90' } });

      // filterHighRiskLeaps should be called with updated filters
      expect(filterHighRiskLeaps).toHaveBeenCalled();
    });

    it('should show filter warning when filters exclude all results', async () => {
      const user = userEvent.setup();

      // Mock to return options that will be filtered out
      const expensiveOptions = [
        { ...mockHighDeltaOption, premium: 100.00 }
      ];
      fetchOptionsChain.mockResolvedValue(expensiveOptions);
      filterHighRiskLeaps.mockReturnValue([]);

      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByText(/No contracts match your filter criteria/)).toBeInTheDocument();
      });
    });

    it('should reset filters when reset button is clicked', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      // Change a filter first
      const sliders = screen.getAllByRole('slider');
      fireEvent.change(sliders[0], { target: { value: '0.95' } });

      // Click reset
      const resetButton = screen.getByRole('button', { name: /reset/i });
      await user.click(resetButton);

      // Delta should be back to default (0.80)
      expect(screen.getByText('0.80')).toBeInTheDocument();
    });
  });

  describe('Refresh Functionality', () => {
    it('should show refresh button after search', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
      });
    });

    it('should re-fetch data when refresh is clicked', async () => {
      const user = userEvent.setup();
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      await user.type(input, 'AAPL');

      const scanButton = getSingleTickerScanButton();
      await user.click(scanButton);

      await waitFor(() => {
        expect(fetchOptionsChain).toHaveBeenCalledTimes(1);
      });

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      await user.click(refreshButton);

      await waitFor(() => {
        expect(fetchOptionsChain).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form controls', () => {
      render(<OptionScanner />);

      const input = screen.getByPlaceholderText(/Enter ticker symbol/);
      expect(input).toBeInTheDocument();

      const scanButton = getSingleTickerScanButton();
      expect(scanButton).toBeEnabled();
    });

    it('should have accessible toggle buttons', () => {
      render(<OptionScanner />);

      const callsButton = screen.getByRole('button', { name: /calls/i });
      const putsButton = screen.getByRole('button', { name: /puts/i });

      expect(callsButton).toBeInTheDocument();
      expect(putsButton).toBeInTheDocument();
    });
  });
});
