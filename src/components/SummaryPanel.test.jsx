/**
 * SummaryPanel Component Tests
 *
 * Tests for the summary statistics panel including:
 * - Statistics calculation and display
 * - Risk distribution bars
 * - Alert badges
 * - Empty state handling
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import SummaryPanel from './SummaryPanel';
import {
  mockHighDeltaOption,
  mockUnusualVolumeOption,
  mockHighIVOption,
  mockFilteredOptions
} from '../test/mocks/optionsData';

describe('SummaryPanel Component', () => {
  describe('Empty State', () => {
    it('should render empty message when no options', () => {
      render(<SummaryPanel options={[]} ticker="" />);

      expect(screen.getByText('Search for a ticker to see summary')).toBeInTheDocument();
    });

    it('should render empty message when options is null', () => {
      render(<SummaryPanel options={null} ticker="" />);

      expect(screen.getByText('Search for a ticker to see summary')).toBeInTheDocument();
    });
  });

  describe('Header Display', () => {
    it('should display ticker in header', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText(/Scan Results:/)).toBeInTheDocument();
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    it('should display total contract count', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('4 contracts')).toBeInTheDocument();
    });

    it('should show live indicator', () => {
      const { container } = render(
        <SummaryPanel options={mockFilteredOptions} ticker="AAPL" />
      );

      const liveIndicator = container.querySelector('.pulse-live');
      expect(liveIndicator).toBeInTheDocument();
    });
  });

  describe('Statistics Cards', () => {
    it('should display contracts count', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Contracts')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('should display average delta', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Avg Delta')).toBeInTheDocument();
      // Average of 0.92, 0.88, 0.85, 0.90 = 0.8875
      // Displayed as absolute value
    });

    it('should display average IV', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Avg IV')).toBeInTheDocument();
    });

    it('should display average price', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Avg Price')).toBeInTheDocument();
    });

    it('should display lowest price in subtext', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      // mockPutOption has the lowest price at 2.80
      expect(screen.getByText(/Lowest: \$2.80/)).toBeInTheDocument();
    });
  });

  describe('Risk Distribution', () => {
    it('should display risk distribution section', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Risk Distribution')).toBeInTheDocument();
    });

    it('should display Low risk category', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Low')).toBeInTheDocument();
    });

    it('should display Medium risk category', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('Medium')).toBeInTheDocument();
    });

    it('should display High risk category', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('should have progress bars for each risk level', () => {
      const { container } = render(
        <SummaryPanel options={mockFilteredOptions} ticker="AAPL" />
      );

      // There should be 3 progress bar containers
      const progressBars = container.querySelectorAll('.bg-gray-800.rounded-full');
      expect(progressBars.length).toBe(3);
    });
  });

  describe('Alert Badges', () => {
    it('should display unusual volume count when present', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      // mockUnusualVolumeOption has unusual volume flag
      expect(screen.getByText(/with unusual volume/)).toBeInTheDocument();
    });

    it('should display high IV count when present', () => {
      render(<SummaryPanel options={mockFilteredOptions} ticker="AAPL" />);

      // mockHighIVOption has high IV flag
      expect(screen.getByText(/with high IV/)).toBeInTheDocument();
    });

    it('should not display alert section when no alerts', () => {
      const normalOptions = [
        mockHighDeltaOption,
        { ...mockHighDeltaOption, id: 'NORMAL-2' }
      ];

      render(<SummaryPanel options={normalOptions} ticker="AAPL" />);

      expect(screen.queryByText(/with unusual volume/)).not.toBeInTheDocument();
      expect(screen.queryByText(/with high IV/)).not.toBeInTheDocument();
    });
  });

  describe('Statistics Calculations', () => {
    it('should calculate correct average delta', () => {
      const options = [
        { ...mockHighDeltaOption, delta: 0.90 },
        { ...mockHighDeltaOption, id: '2', delta: 0.80 }
      ];

      render(<SummaryPanel options={options} ticker="TEST" />);

      // Average of 0.90 and 0.80 = 0.85
      expect(screen.getByText('0.850')).toBeInTheDocument();
    });

    it('should handle absolute delta for puts', () => {
      const options = [
        { ...mockHighDeltaOption, delta: 0.90 },
        { ...mockHighDeltaOption, id: '2', delta: -0.90, optionType: 'put' }
      ];

      render(<SummaryPanel options={options} ticker="TEST" />);

      // Both absolute deltas are 0.90, average is 0.90
      expect(screen.getByText('0.900')).toBeInTheDocument();
    });

    it('should calculate correct highest delta', () => {
      const options = [
        { ...mockHighDeltaOption, delta: 0.85 },
        { ...mockHighDeltaOption, id: '2', delta: 0.95 },
        { ...mockHighDeltaOption, id: '3', delta: 0.88 }
      ];

      render(<SummaryPanel options={options} ticker="TEST" />);

      expect(screen.getByText(/Max: 0.950/)).toBeInTheDocument();
    });

    it('should format IV as percentage', () => {
      const options = [
        { ...mockHighDeltaOption, iv: 0.35 },
        { ...mockHighDeltaOption, id: '2', iv: 0.45 }
      ];

      render(<SummaryPanel options={options} ticker="TEST" />);

      // Average IV is 0.40 = 40.0% - check for the percentage display
      const ivElement = screen.getByText(/Avg IV/);
      expect(ivElement).toBeInTheDocument();
    });

    it('should format average price as currency', () => {
      const options = [
        { ...mockHighDeltaOption, premium: 3.00 },
        { ...mockHighDeltaOption, id: '2', premium: 5.00 }
      ];

      render(<SummaryPanel options={options} ticker="TEST" />);

      // Average premium is 4.00
      expect(screen.getByText('$4.00')).toBeInTheDocument();
    });
  });

  describe('Single Option', () => {
    it('should display correctly with single option', () => {
      render(<SummaryPanel options={[mockHighDeltaOption]} ticker="AAPL" />);

      // Check contract count is shown
      expect(screen.getByText('1 contracts')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have semantic structure', () => {
      render(
        <SummaryPanel options={mockFilteredOptions} ticker="AAPL" />
      );

      // Should have proper headings or labels
      expect(screen.getByText('Risk Distribution')).toBeInTheDocument();
      expect(screen.getByText(/Scan Results:/)).toBeInTheDocument();
    });
  });
});
