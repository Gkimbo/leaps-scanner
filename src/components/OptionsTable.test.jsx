/**
 * OptionsTable Component Tests
 *
 * Tests for the options table including:
 * - Table rendering with data
 * - Column sorting functionality
 * - Loading state
 * - Empty state
 * - Risk badges
 * - Unusual volume/high IV highlighting
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '../test/utils';
import userEvent from '@testing-library/user-event';
import OptionsTable from './OptionsTable';
import {
  mockHighDeltaOption,
  mockUnusualVolumeOption,
  mockHighIVOption,
  mockPutOption,
  mockFilteredOptions
} from '../test/mocks/optionsData';

describe('OptionsTable Component', () => {
  describe('Rendering with Data', () => {
    it('should render table with column headers', () => {
      render(<OptionsTable options={mockFilteredOptions} isLoading={false} />);

      expect(screen.getByText('Symbol')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Strike')).toBeInTheDocument();
      expect(screen.getByText('Price')).toBeInTheDocument();
      expect(screen.getByText('Delta')).toBeInTheDocument();
      // IV appears multiple times (header + badges), use getAllByText
      expect(screen.getAllByText('IV').length).toBeGreaterThan(0);
      expect(screen.getByText('Open Int')).toBeInTheDocument();
      expect(screen.getByText('Expiration')).toBeInTheDocument();
      expect(screen.getByText('Risk')).toBeInTheDocument();
    });

    it('should render option rows', () => {
      render(<OptionsTable options={mockFilteredOptions} isLoading={false} />);

      // Check that symbols are rendered
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.getByText('SPY')).toBeInTheDocument();
    });

    it('should display call option type badge', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('CALL')).toBeInTheDocument();
    });

    it('should display put option type badge', () => {
      render(<OptionsTable options={[mockPutOption]} isLoading={false} />);

      expect(screen.getByText('PUT')).toBeInTheDocument();
    });

    it('should display strike prices formatted as currency', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });

    it('should display premium prices', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('$3.50')).toBeInTheDocument();
    });

    it('should display delta values', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('0.920')).toBeInTheDocument();
    });

    it('should display IV as percentage', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      // IV of 0.28 should display as 28.0%
      expect(screen.getByText('28.0%')).toBeInTheDocument();
    });

    it('should display open interest with locale formatting', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('25,000')).toBeInTheDocument();
    });

    it('should display expiration date and days to expiry', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('2026-01-16')).toBeInTheDocument();
      expect(screen.getByText('400 days')).toBeInTheDocument();
    });
  });

  describe('Risk Badges', () => {
    it('should display Low risk badge for high delta low IV option', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      expect(screen.getByText('Low')).toBeInTheDocument();
    });

    it('should display Med risk badge for medium risk option', () => {
      // Create a medium risk option
      const mediumRiskOption = {
        ...mockHighDeltaOption,
        id: 'MED-RISK',
        delta: 0.87,
        iv: 0.40
      };

      render(<OptionsTable options={[mediumRiskOption]} isLoading={false} />);

      expect(screen.getByText('Med')).toBeInTheDocument();
    });

    it('should display High risk badge for high risk option', () => {
      // mockHighIVOption has high IV which should result in high risk
      render(<OptionsTable options={[mockHighIVOption]} isLoading={false} />);

      expect(screen.getByText('High')).toBeInTheDocument();
    });
  });

  describe('Special Indicators', () => {
    it('should display unusual volume badge', () => {
      render(<OptionsTable options={[mockUnusualVolumeOption]} isLoading={false} />);

      expect(screen.getByText('Vol')).toBeInTheDocument();
    });

    it('should display high IV badge', () => {
      render(<OptionsTable options={[mockHighIVOption]} isLoading={false} />);

      // Should have 2 IV elements - header and badge
      const ivElements = screen.getAllByText('IV');
      expect(ivElements.length).toBe(2);
    });

    it('should not display badges for normal options', () => {
      render(<OptionsTable options={[mockHighDeltaOption]} isLoading={false} />);

      // These badges should not be present for normal options
      expect(screen.queryByText('Vol')).not.toBeInTheDocument();
      // Note: 'IV' appears in the header, so we check for the badge specifically
      const ivBadges = screen.queryAllByText('IV');
      // Only the header should have 'IV', not a badge
      expect(ivBadges.length).toBe(1);
    });
  });

  describe('Column Sorting', () => {
    it('should sort by price by default (ascending)', () => {
      const options = [
        { ...mockHighDeltaOption, id: 'A', premium: 5.00 },
        { ...mockHighDeltaOption, id: 'B', premium: 2.00 },
        { ...mockHighDeltaOption, id: 'C', premium: 8.00 }
      ];

      render(<OptionsTable options={options} isLoading={false} />);

      const rows = screen.getAllByRole('row');
      // First row is header, data rows start at index 1
      // Should be sorted by premium ascending: 2.00, 5.00, 8.00
      expect(within(rows[1]).getByText('$2.00')).toBeInTheDocument();
      expect(within(rows[2]).getByText('$5.00')).toBeInTheDocument();
      expect(within(rows[3]).getByText('$8.00')).toBeInTheDocument();
    });

    it('should toggle sort direction when clicking column header', async () => {
      const user = userEvent.setup();
      const options = [
        { ...mockHighDeltaOption, id: 'A', symbol: 'AAPL', premium: 3.00 },
        { ...mockHighDeltaOption, id: 'B', symbol: 'MSFT', premium: 5.00 },
        { ...mockHighDeltaOption, id: 'C', symbol: 'GOOGL', premium: 2.00 }
      ];

      render(<OptionsTable options={options} isLoading={false} />);

      // Click price header to toggle sort direction
      const priceHeader = screen.getByText('Price');
      await user.click(priceHeader);

      // Should now be sorted descending
      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('$5.00')).toBeInTheDocument();
    });

    it('should sort by different columns when clicked', async () => {
      const user = userEvent.setup();
      const options = [
        { ...mockHighDeltaOption, id: 'A', delta: 0.85 },
        { ...mockHighDeltaOption, id: 'B', delta: 0.95 },
        { ...mockHighDeltaOption, id: 'C', delta: 0.88 }
      ];

      render(<OptionsTable options={options} isLoading={false} />);

      // Click delta header to sort by delta
      const deltaHeader = screen.getByText('Delta');
      await user.click(deltaHeader);

      // Should be sorted by delta ascending
      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getByText('0.850')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should render loading skeleton when isLoading is true', () => {
      render(<OptionsTable options={[]} isLoading={true} />);

      // Should have animated skeleton elements
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not render table data when loading', () => {
      render(<OptionsTable options={mockFilteredOptions} isLoading={true} />);

      // Should not show actual option data
      expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should render empty state when no options provided', () => {
      render(<OptionsTable options={[]} isLoading={false} />);

      expect(screen.getByText('No contracts found')).toBeInTheDocument();
      expect(screen.getByText(/Try adjusting your filters/)).toBeInTheDocument();
    });

    it('should render empty state when options is null', () => {
      render(<OptionsTable options={null} isLoading={false} />);

      expect(screen.getByText('No contracts found')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible table structure', () => {
      render(<OptionsTable options={mockFilteredOptions} isLoading={false} />);

      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();

      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders.length).toBe(12); // 12 columns (including Rec)
    });

    it('should have clickable column headers for sorting', () => {
      render(<OptionsTable options={mockFilteredOptions} isLoading={false} />);

      const columnHeaders = screen.getAllByRole('columnheader');

      // All headers should be in the document and clickable
      expect(columnHeaders.length).toBe(12);
      columnHeaders.forEach((header) => {
        expect(header).toBeInTheDocument();
      });
    });
  });
});
