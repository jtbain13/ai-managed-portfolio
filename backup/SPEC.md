# Momentum Portfolio - Next.js + Supabase + Vercel Spec

## Supabase Config
- Project URL: https://ijmumjibnzhjdboynbta.supabase.co
- Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbXVtamlibnpoamRib3luYnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzI3MjksImV4cCI6MjA5MDU0ODcyOX0.i0ohlaRmbPU3LW3hqhLYMyYN9TbOIOOiG9DnG_VPjpg

## Database Schema (already created in Supabase)
All tables have RLS enabled with user_id policies.

Tables:
- portfolio_settings (id, user_id, alpaca_api_key, alpaca_secret_key, rapid_api_key, is_paper_trading, max_positions, rebalance_frequency, drift_threshold, cash_reserve, auto_trade_enabled, last_rebalance, portfolio_value)
- holdings (id, user_id, ticker, company_name, sector, target_weight, current_weight, shares, avg_cost_basis, current_price, market_value, gain_loss, gain_loss_percent, momentum_score, sector_score, composite_score, added_at, status)
- trades (id, user_id, ticker, side, qty, price, total_value, reason, status, alpaca_order_id, executed_at, created_at)
- screened_stocks (id, user_id, ticker, company_name, sector, price, return_1m, return_3m, return_6m, return_12m, momentum_score, momentum_consistency, volatility, volume, sector_score, composite_score, sa_quant_rating, sa_momentum_grade, screened_at)
- sector_outlook (id, sector, score, rationale, key_trends JSONB, updated_at) -- no user_id, shared data
- activity_log (id, user_id, type, message, details JSONB, created_at)

## App Requirements

### Auth
- Supabase Auth with email/password login
- Full-page login screen (dark theme, finance aesthetic)
- Protected routes - redirect to login if not authenticated
- Only the owner can access (single user app)

### Pages (all under auth protection)
1. Dashboard (/) - KPI cards, holdings table, weight distribution
2. Screen (/screen) - Run momentum screen, view results, add to portfolio
3. Sectors (/sectors) - Sector outlook cards with scores
4. Trades (/trades) - Trade history
5. Activity (/activity) - Activity log
6. Settings (/settings) - Alpaca connection, model portfolio value, RapidAPI key

### API Routes (Next.js /api/*)
All API routes must verify Supabase auth token from request.

#### GET /api/settings - Get user settings
#### PATCH /api/settings - Update settings
#### GET /api/holdings - Get active holdings
#### POST /api/holdings - Add holding
#### DELETE /api/holdings/[id] - Remove holding
#### GET /api/trades - Get trade history
#### POST /api/screen - Run momentum screen (fetches Yahoo Finance data for 100 stocks)
#### GET /api/screened - Get last screen results
#### GET /api/sectors - Get sector outlook
#### GET /api/portfolio/summary - Calculate portfolio values (model mode + live mode)
#### POST /api/portfolio/set-value - Set model portfolio capital
#### POST /api/portfolio/add-from-screen - Add top stocks to portfolio
#### POST /api/alpaca/connect - Test + save Alpaca credentials
#### POST /api/rebalance - Execute rebalance via Alpaca

### Momentum Engine (same logic as original)
- Screen 100 large-cap stocks
- Calculate 1/3/6/12 month returns from Yahoo Finance
- Momentum consistency (smoothness of positive months)
- Composite score: 70% momentum + 30% sector macro score
- Sector scores from sector_outlook table

### Model Portfolio Mode
- When no real Alpaca shares exist, calculate hypothetical values from target weights
- Default model capital: $10,000
- User can set custom amount via settings

### Design
- Dark mode finance dashboard aesthetic
- Primary accent: emerald/teal green (HSL ~160 84% 39%)
- Dark backgrounds (HSL ~222 22% 8%)
- Use Tailwind CSS, shadcn/ui components
- Tabular nums for all financial data
- Color-code: green for positive, red for negative P&L
