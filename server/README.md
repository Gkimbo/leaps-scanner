# LEAPS Scanner Backend Server

Fast options data fetching server for the LEAPS Scanner frontend.

## Why Use This Server?

- **No CORS issues** - Server-side API requests
- **Fast scanning** - No frontend rate limit delays
- **Fallback support** - Polygon.io with Yahoo Finance fallback
- **Server-side caching** - Reduce API calls

## Quick Start

```bash
# Install dependencies
npm install

# Copy .env.example and add your API key
cp .env.example .env
# Edit .env and add your POLYGON_API_KEY

# Start server
npm start

# Or with auto-reload during development
npm run dev
```

Server runs on `http://localhost:3001`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `POLYGON_API_KEY` | Yes | Your Polygon.io API key |
| `PORT` | No | Server port (default: 3001) |

## API Endpoints

### Health Check
```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 123.456,
  "providers": {
    "yahoo": "available",
    "polygon": "available"
  }
}
```

### Get Options for Ticker
```
GET /api/options/:ticker?type=call&provider=polygon
```

Parameters:
- `ticker` - Stock symbol (e.g., AAPL)
- `type` - Option type: `call` or `put` (default: call)
- `provider` - Preferred provider: `polygon` or `yahoo` (default: polygon)

Response:
```json
{
  "ticker": "AAPL",
  "optionType": "call",
  "count": 100,
  "options": [...],
  "provider": "polygon",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

### Batch Fetch Options
```
POST /api/options/batch
Content-Type: application/json

{
  "tickers": ["AAPL", "MSFT", "GOOGL"],
  "type": "call",
  "provider": "polygon"
}
```

## Frontend Configuration

Make sure your frontend `.env` has:

```env
VITE_OPTIONS_API_PROVIDER=backend
VITE_BACKEND_URL=http://localhost:3001
```

## Data Providers

| Provider | Data Source | Notes |
|----------|-------------|-------|
| Polygon.io | Reference contracts + estimated Greeks | Primary, requires API key |
| Yahoo Finance | Full options chain with Greeks | Fallback, may be rate-limited |

## Troubleshooting

### Server won't start
- Make sure port 3001 is available
- Check Node.js version >= 18

### "Polygon API access denied"
- Check your POLYGON_API_KEY is valid
- Make sure key has options access

### No data returned
- Some stocks may not have LEAPS options
- Try a popular ticker like AAPL first

### Frontend still shows "Backend Unavailable"
- Ensure server is running on port 3001
- Check browser console for CORS errors
- Verify VITE_BACKEND_URL is correct
