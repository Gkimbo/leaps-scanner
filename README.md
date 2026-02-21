# High Risk LEAPS Scanner

A modern React web application for scanning and analyzing stock options contracts based on aggressive LEAPS (Long-term Equity Anticipation Securities) criteria. Features advanced probability calculations, options vs stock comparisons, and a comprehensive profit/loss calculator.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-06B6D4?logo=tailwindcss)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite)

## Features

### Core Functionality
- **Ticker Search** - Search any stock symbol for LEAPS options
- **Auto-Scan Mode** - Scan 100+ stocks and find the top LEAPS contracts
- **Trending Stocks** - Scan trending stocks from Finnhub news API
- **Price Tier Filters** - Quick filters for stocks ≤$50 or ≤$3
- **Call/Put Toggle** - Switch between call and put options
- **Advanced Filtering** - Filter by delta, price, open interest, IV, expiration, and score
- **Dual View Modes** - Table view with sortable columns or card view
- **Real-time Data** - Free Yahoo Finance integration (no API key required)
- **Calculator Modal** - Comprehensive profit/loss calculator with probability analysis

### Auto-Scan Feature
The scanner can automatically scan stocks and rank the best LEAPS contracts:

| Feature | Description |
|---------|-------------|
| **Stock Universe** | 100+ stocks under $50, 70+ penny stocks under $3 |
| **Trending Mode** | Scan stocks mentioned in recent Finnhub news |
| **Price Tiers** | Quick toggle between ≤$50 and ≤$3 stock filters |
| **Ranking Algorithm** | Probability-weighted score with break-even analysis |
| **Rate Limiting** | Automatic rate limiting with progress tracking |
| **Top Results** | Returns best 50 contracts by score |

### LEAPS Score Algorithm
The scoring algorithm balances probability of profit with value:

```
Score = (probProfit × 0.4 + valueRatio × 0.6) × breakEvenPenalty

Where:
- probProfit = Estimated probability of profit based on delta and break-even distance
- valueRatio = (delta × 100) / price
- breakEvenPenalty = 1.0 if <10%, 0.75 if 10-20%, 0.5 if >20% distance to break-even
```

Higher scores indicate better probability-adjusted value.

### Filter Criteria
| Filter | Range | Default | Description |
|--------|-------|---------|-------------|
| **Min Delta** | 0.50 - 0.99 | 0.80 | High delta for stock-like behavior |
| **Max Price** | $1 - $100 | $5.00 | Contract premium limit |
| **Min Open Interest** | 0 - 50,000 | 0 | Filter by liquidity |
| **Min Days to Expiry** | 180 - 730 | 365 | True LEAPS timeframe |
| **Max IV** | 20% - Any | Any | Filter high volatility |
| **Min Score** | 0 - 30 | 0 | Minimum LEAPS score |

### Calculator Modal
Click any contract to open the comprehensive calculator:

#### Investment Summary
- Total cost and shares controlled
- Leverage ratio vs buying stock directly
- Options vs Stock comparison table showing P/L at various price levels
- Break-even price and distance

#### Probability Analysis (Black-Scholes)
- Chance of any profit
- Chance of finishing ITM
- Probability of +50%, +100%, +200% returns
- Expected move based on IV
- 68% probability range (1 sigma)
- Risk/Reward ratio
- Visual outcome distribution

#### Trade the Contract
- Buy price and total investment
- Adjustable sell price with quick scenario buttons
- Profit/loss calculation for trading the option itself
- Scenarios from -50% to +200%

#### Educational Section
- Beginner-friendly explanations of options
- Key terms defined
- LEAPS-specific information
- Plain English trade summary

### Display Information
| Column | Description | Sortable |
|--------|-------------|----------|
| Symbol | Underlying stock ticker | Yes |
| Type | Call or Put | Yes |
| Strike | Strike price | Yes |
| Price | Contract premium | Yes (default) |
| Delta | Option delta (Greek) | Yes |
| IV | Implied volatility | Yes |
| Open Interest | Number of open contracts | Yes |
| Score | LEAPS score (probability-weighted) | Yes |
| Expiration | Contract expiration date | Yes |
| Risk | Risk level badge (Low/Medium/High) | No |

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app runs at `http://localhost:5173`

## Configuration

### Environment Variables

Create a `.env` file for optional configuration:

```bash
# Optional: Finnhub API key for trending stocks feature
VITE_FINNHUB_API_KEY=your_finnhub_key

# Data provider (defaults to yahoo)
VITE_OPTIONS_API_PROVIDER=yahoo
```

### Data Providers

| Provider | Cost | Data Delay | Greeks | Notes |
|----------|------|------------|--------|-------|
| Yahoo Finance | Free | ~15 min | Estimated | Default, no API key required |
| Finnhub | Free | Real-time | N/A | For trending stocks (optional) |
| Polygon.io | Freemium | Real-time | Yes | Requires API key |
| Tradier | Free sandbox | Real-time | Yes | Requires API key |

### Finnhub Setup (Optional)
To enable the Trending stocks feature:

1. Get a free API key from [Finnhub](https://finnhub.io/)
2. Add to your `.env` file: `VITE_FINNHUB_API_KEY=your_key`
3. The Trending button will show "Finnhub Ready" when configured

## Project Structure

```
src/
├── components/
│   ├── OptionScanner.jsx   # Main dashboard orchestrator
│   ├── CalculatorModal.jsx # P/L calculator with probability analysis
│   ├── FiltersPanel.jsx    # Delta, price, OI, IV, expiration sliders
│   ├── OptionsTable.jsx    # Sortable table with animations
│   ├── OptionCard.jsx      # Card view components
│   ├── SummaryPanel.jsx    # Statistics and risk distribution
│   ├── ScanProgressBar.jsx # Auto-scan progress indicator
│   └── index.js            # Component exports
├── hooks/
│   └── useAutoScan.js      # Auto-scan state management hook
├── services/
│   ├── optionsApi.js       # API integrations + score calculation
│   ├── finnhubApi.js       # Finnhub API for trending stocks
│   ├── stockUniverse.js    # Stock lists by price tier
│   ├── rateLimiter.js      # API rate limiting utilities
│   └── scanCache.js        # Scan results caching
├── App.jsx                 # Root component
├── main.jsx                # Entry point
└── index.css               # TailwindCSS + custom theme
```

## Tech Stack

- **React 19** - UI framework with functional components & hooks
- **Vite 7** - Build tool and dev server
- **TailwindCSS 4** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **Lucide React** - Icon library
- **Vitest** - Unit testing framework

## Design

The UI is inspired by professional trading platforms:
- Dark theme optimized for extended viewing
- Neon accent colors for key data points
- Smooth animations for state transitions
- Responsive layout for all screen sizes

### Color Scheme
| Element | Color |
|---------|-------|
| Bull/Calls | Green (`#10b981`) |
| Bear/Puts | Red (`#ef4444`) |
| Accent | Cyan (`#00d4ff`) |
| Low Risk | Green |
| Medium Risk | Amber |
| High Risk | Red |

## Probability Calculations

The calculator uses Black-Scholes methodology for probability estimates:

```javascript
// Standard normal CDF (Abramowitz & Stegun approximation)
// d2 = [ln(S/K) + (r - σ²/2) × T] / (σ × √T)
// P(profit) = N(d2) for calls, 1 - N(d2) for puts
```

Key metrics calculated:
- **Probability of Profit**: Chance stock reaches break-even price
- **Probability ITM**: Chance option finishes in-the-money
- **Expected Move**: 1 standard deviation move based on IV
- **Risk/Reward Ratio**: Potential reward vs risk (premium paid)

## Error Handling

The app handles various error states gracefully:
- **No API configured**: Shows informative message with setup options
- **Rate limiting**: Automatic retry with backoff
- **Network errors**: Clear error messages without technical jargon
- **No results**: Helpful suggestions for adjusting filters

## Disclaimer

This application is for educational and informational purposes only. Options trading involves substantial risk of loss and is not suitable for all investors. The probability estimates use mathematical models that assume log-normal price distribution and may not reflect actual market conditions. Always conduct your own research and consult with a qualified financial advisor before making investment decisions.

## License

MIT
