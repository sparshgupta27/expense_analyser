# 🏦 Bank Passbook Expense Analyzer

An automated, privacy-first personal finance platform that ingests transaction emails from Gmail, normalizes payee details, detects subscriptions & ghost recurring charges, flags spending anomalies, and presents your financial health in a sleek **Banking Passbook** aesthetic.

---

## 🌟 Architecture & Highlights

```
  ┌────────────────┐       ┌─────────────────┐       ┌────────────────────┐
  │  Gmail OAuth2  │ ────> │  Ingestion API  │ ────> │  Kafka (raw-emails)│
  └────────────────┘       └─────────────────┘       └────────────────────┘
                                                               │
                                                               ▼
  ┌────────────────┐       ┌─────────────────┐       ┌────────────────────┐
  │ Passbook UI    │ <──── │ PostgreSQL DB   │ <──── │ Parser & Dedupe    │
  │ (React/Vite)   │       │ & Redis Cache   │       │ (Regex + LLM)      │
  └────────────────┘       └─────────────────┘       └────────────────────┘
```

- **Incremental Email Syncing:** Fetches new transaction emails from Gmail without re-scanning full inbox history.
- **Multi-Sender Regex Parsers:** Specialized parsers for Indian banks and payment gateways (HDFC, ICICI, SBI, GPay, PhonePe, Paytm, Amazon Pay, Swiggy, Zomato).
- **Merchant Normalization Engine:** Strips transaction IDs, order numbers, store codes, and UPI noise (`"SWIGGY*ORDER8827"` ➔ `"Swiggy"`).
- **SHA-256 Deduplication:** Buckets transactions in 5-minute time windows (`SHA256(amount + merchant + 5min_bucket)`) to suppress duplicate alerts from bank SMS/emails and merchant receipts.
- **LLM Batch Fallback:** Sends unmatched emails to Anthropic Claude API in batch runs to extract structured JSON without data loss.
- **Subscription & Ghost Detection:** Detects recurring payment intervals (7, 14, 30, 90, 365 days ± 3d) and flags "Ghost Subscriptions" (recurring charges with zero non-subscription user activity over 90 days).
- **Spending Anomaly Engine:** Compares current category spending against a 3-month rolling average to highlight unusual spikes (>40% above baseline).
- **Passbook Aesthetic UI:** Styled like a physical banking ledger using paper textures, ledger green (`#2D5C4E`), warm rust, and monospace entry lines.

---

## 🚀 Features Built

### 1. Ingestion & Parsing
| Component | Description |
| :--- | :--- |
| **Gmail OAuth Ingestion** | Incremental fetch using `q: after:{timestamp}` / `historyId` checkpoints. |
| **Parser Registry** | 9 custom regex parsers extracting `amount`, `merchant_raw`, `transaction_type`, `account_last4`, and `date`. |
| **Test Harness** | Jest test suite assertions against real HTML fixtures in `backend/test/fixtures/`. |

### 2. Data Cleaning & Deduplication
| Feature | Details |
| :--- | :--- |
| **Normalizer** | Regex rules stripping corporate suffixes, order IDs, ref numbers, and VPA noise. |
| **Categorizer** | Category engine mapping payees to *Food, Shopping, Bills, Transport, Entertainment, Subscriptions, Other*. Supports custom user overrides. |
| **Deduplication** | SHA-256 hash suppressing cross-email duplicates within a 5-minute time window. |

### 3. Intelligence & Analytics
| Job | Execution |
| :--- | :--- |
| **LLM Batch Fallback** | Claude API batch job processing unmatched emails (`processed = false`). |
| **Subscription Detector** | Identifies recurring charge cycles, predicts renewal dates, flags price changes, and flags Ghost Subscriptions. |
| **Anomaly Detector** | Category spending comparison against rolling historical baselines with severity scoring. |

### 4. Passbook Frontend UI
- **Dashboard:** Ledger statement header, monthly trend area chart, top merchants table, anomaly banners, AI insight cards.
- **Transactions Page:** Filterable transaction table, payment mode/parser badges, manual transaction modal, digital receipt view.
- **Subscriptions Page:** Active services count, monthly burn rate metric, renewal timeline stubs, ghost subscription alerts.

---

## 🛠️ Project Structure

```
expense_analyser/
├── backend/
│   ├── src/
│   │   ├── auth/          # Google OAuth2 handler
│   │   ├── config/        # Environment configurations
│   │   ├── db/            # Postgres connection, migrations, mockStore fallback
│   │   ├── jobs/          # Anomaly detector, Subscription scanner, LLM batch job
│   │   ├── parsers/       # HDFC, ICICI, SBI, GPay, PhonePe, Paytm, Amazon, Swiggy, Zomato
│   │   ├── routes/        # Express API routes (dashboard, transactions, subscriptions)
│   │   └── services/      # Gmail ingestion, Kafka producer/consumer, Normalizer, Categorizer
│   └── test/              # Jest test harness and HTML email fixtures
├── frontend/
│   ├── src/
│   │   ├── api/           # Axios HTTP client
│   │   ├── components/ui/ # Custom Passbook UI primitives (Card, Badge, Alert, Table)
│   │   └── pages/         # Dashboard, Transactions, Subscriptions pages
│   └── index.html
├── docker-compose.yml     # PostgreSQL, Redis, Zookeeper, Kafka, Backend, Frontend
└── README.md
```

---

## 💻 Running the App

### Option A: Local Dev Mode (Quickstart)

#### 1. Backend Setup
```bash
cd backend
npm install
npm run dev
```
*Backend runs on `http://localhost:3001`*

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`*

#### 3. Run Parser Tests
```bash
cd backend
npm test
```

---

### Option B: Full Docker Stack (Postgres + Redis + Kafka)

```bash
docker-compose up --build
```

Services started:
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`
- **Kafka:** `localhost:9092`
- **Backend API:** `localhost:3001`
- **Frontend App:** `localhost:3000`

---

### Option C: Cloud Deployment (Azure + Vercel)

Deploy the backend on **Azure App Service** and the frontend on **Vercel**:

#### Backend (Azure App Service)

1. Create a Node.js App Service on Azure (Linux, Free/B1 tier).
2. Connect your GitHub repository for CI/CD.
3. Set the following **Application Settings** in Azure Portal → Configuration:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` = `https://<your-azure-domain>/auth/google/callback`
   - `FRONTEND_URL` = `https://<your-vercel-domain>`
   - `DATABASE_URL` = your Neon/Postgres connection string
   - `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`
   - `NODE_ENV` = `production`
4. Update [Google Cloud Console](https://console.cloud.google.com/apis/credentials) Authorized Redirect URIs to point to Azure.

#### Frontend (Vercel)

1. Import your repository on [Vercel](https://vercel.com).
2. Set the **Root Directory** to `frontend`.
3. Add environment variable: `VITE_API_URL` = `https://<your-azure-domain>`
4. Deploy. Vercel will auto-detect Vite and build the frontend.

---

## 🧪 Testing

The backend includes a fixture test harness to verify parser accuracy against saved HTML emails:

```bash
cd backend
npm test
```

Test output:
```text
PASS test/parsers/hdfc.test.js
PASS test/parsers/phonepe.test.js
PASS test/parsers/normalizer.test.js
PASS test/parsers/gpay.test.js

Test Suites: 4 passed, 4 total
Tests:       12 passed, 12 total
```

---

## 📜 License
---

## 💻 Running the App

### Option A: Local Dev Mode (Quickstart)

#### 1. Backend Setup
```bash
cd backend
npm install
npm run dev
```
*Backend runs on `http://localhost:3001`*

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:3000`*

#### 3. Run Parser Tests
```bash
cd backend
npm test
```

---

### Option B: Full Docker Stack (Postgres + Redis + Kafka)

```bash
docker-compose up --build
```

Services started:
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`
- **Kafka:** `localhost:9092`
- **Backend API:** `localhost:3001`
- **Frontend App:** `localhost:3000`

---

## 🧪 Testing

The backend includes a fixture test harness to verify parser accuracy against saved HTML emails:

```bash
cd backend
npm test
```

Test output:
```text
PASS test/parsers/hdfc.test.js
PASS test/parsers/phonepe.test.js
PASS test/parsers/normalizer.test.js
PASS test/parsers/gpay.test.js

Test Suites: 4 passed, 4 total
Tests:       12 passed, 12 total
```

---

## 📜 License
MIT License
