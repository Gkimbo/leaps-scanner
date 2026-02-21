/**
 * OptionCard Component Tests
 *
 * Tests for the card view including:
 * - Card rendering with option data
 * - Risk level display
 * - Greeks display
 * - Special indicator badges
 * - OptionCardsGrid rendering
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import OptionCard, { OptionCardsGrid } from './OptionCard';
import {
  mockHighDeltaOption,
  mockUnusualVolumeOption,
  mockHighIVOption,
  mockPutOption,
  mockFilteredOptions
} from '../test/mocks/optionsData';

describe('OptionCard Component', () => {
  describe('Basic Rendering', () => {
    it('should render option symbol', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    it('should render call option type badge', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('CALL')).toBeInTheDocument();
    });

    it('should render put option type badge', () => {
      render(<OptionCard option={mockPutOption} index={0} />);

      expect(screen.getByText('PUT')).toBeInTheDocument();
    });

    it('should render strike price', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('$150.00 Strike')).toBeInTheDocument();
    });

    it('should render premium price', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('$3.50')).toBeInTheDocument();
      expect(screen.getByText('per contract')).toBeInTheDocument();
    });

    it('should render underlying price', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText(/Underlying: \$185/)).toBeInTheDocument();
    });
  });

  describe('Greeks Display', () => {
    it('should display delta value', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('Delta')).toBeInTheDocument();
      expect(screen.getByText('0.920')).toBeInTheDocument();
    });

    it('should display IV value as percentage', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      // IV label and value
      expect(screen.getAllByText('IV').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('28.0%')).toBeInTheDocument();
    });

    it('should display open interest', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('Open Int')).toBeInTheDocument();
      expect(screen.getByText('25,000')).toBeInTheDocument();
    });

    it('should display volume', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('Volume')).toBeInTheDocument();
      expect(screen.getByText('1,500')).toBeInTheDocument();
    });
  });

  describe('Expiration Display', () => {
    it('should display expiration date', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('2026-01-16')).toBeInTheDocument();
    });

    it('should display days to expiry', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('400 days to expiry')).toBeInTheDocument();
    });
  });

  describe('Risk Level Display', () => {
    it('should display Low Risk for high delta low IV', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.getByText('Low Risk')).toBeInTheDocument();
    });

    it('should display High Risk for lower delta or high IV', () => {
      render(<OptionCard option={mockHighIVOption} index={0} />);

      expect(screen.getByText('High Risk')).toBeInTheDocument();
    });

    it('should display Medium Risk for moderate options', () => {
      const mediumRiskOption = {
        ...mockHighDeltaOption,
        delta: 0.87,
        iv: 0.40
      };

      render(<OptionCard option={mediumRiskOption} index={0} />);

      expect(screen.getByText('Medium Risk')).toBeInTheDocument();
    });
  });

  describe('Special Indicator Badges', () => {
    it('should display Unusual Volume badge when flagged', () => {
      render(<OptionCard option={mockUnusualVolumeOption} index={0} />);

      expect(screen.getByText('Unusual Volume')).toBeInTheDocument();
    });

    it('should display High IV badge when flagged', () => {
      render(<OptionCard option={mockHighIVOption} index={0} />);

      expect(screen.getByText('High IV')).toBeInTheDocument();
    });

    it('should not display badges for normal options', () => {
      render(<OptionCard option={mockHighDeltaOption} index={0} />);

      expect(screen.queryByText('Unusual Volume')).not.toBeInTheDocument();
      expect(screen.queryByText('High IV')).not.toBeInTheDocument();
    });

    it('should display both badges when both flags are true', () => {
      const bothFlagsOption = {
        ...mockHighDeltaOption,
        unusualVolume: true,
        highIV: true
      };

      render(<OptionCard option={bothFlagsOption} index={0} />);

      expect(screen.getByText('Unusual Volume')).toBeInTheDocument();
      expect(screen.getByText('High IV')).toBeInTheDocument();
    });
  });

  describe('Put Option Specifics', () => {
    it('should handle negative delta for puts', () => {
      render(<OptionCard option={mockPutOption} index={0} />);

      expect(screen.getByText('-0.900')).toBeInTheDocument();
    });

    it('should show correct put strike price', () => {
      render(<OptionCard option={mockPutOption} index={0} />);

      expect(screen.getByText('$550.00 Strike')).toBeInTheDocument();
    });
  });
});

describe('OptionCardsGrid Component', () => {
  describe('Rendering', () => {
    it('should render multiple cards', () => {
      render(<OptionCardsGrid options={mockFilteredOptions} isLoading={false} />);

      // Should render all 4 mock options
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('TSLA')).toBeInTheDocument();
      expect(screen.getByText('NVDA')).toBeInTheDocument();
      expect(screen.getByText('SPY')).toBeInTheDocument();
    });

    it('should render cards in a grid layout', () => {
      const { container } = render(
        <OptionCardsGrid options={mockFilteredOptions} isLoading={false} />
      );

      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should render loading skeletons when isLoading is true', () => {
      const { container } = render(
        <OptionCardsGrid options={[]} isLoading={true} />
      );

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should render 6 skeleton cards', () => {
      const { container } = render(
        <OptionCardsGrid options={[]} isLoading={true} />
      );

      // Grid should contain 6 skeleton cards
      const skeletonCards = container.querySelectorAll('.animate-pulse');
      expect(skeletonCards.length).toBe(6);
    });
  });

  describe('Empty State', () => {
    it('should return null when no options and not loading', () => {
      const { container } = render(
        <OptionCardsGrid options={[]} isLoading={false} />
      );

      // Should not render anything
      expect(container.firstChild).toBeNull();
    });

    it('should return null when options is null', () => {
      const { container } = render(
        <OptionCardsGrid options={null} isLoading={false} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Card Ordering', () => {
    it('should render cards in the order provided', () => {
      const orderedOptions = [
        { ...mockHighDeltaOption, id: 'first', symbol: 'FIRST' },
        { ...mockHighDeltaOption, id: 'second', symbol: 'SECOND' },
        { ...mockHighDeltaOption, id: 'third', symbol: 'THIRD' }
      ];

      render(<OptionCardsGrid options={orderedOptions} isLoading={false} />);

      const cards = screen.getAllByText(/FIRST|SECOND|THIRD/);
      expect(cards[0]).toHaveTextContent('FIRST');
      expect(cards[1]).toHaveTextContent('SECOND');
      expect(cards[2]).toHaveTextContent('THIRD');
    });
  });
});
