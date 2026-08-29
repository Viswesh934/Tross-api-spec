# LinkedIn Profile API

A fast, lightweight, and structured LinkedIn Profile Scraper API built with **Hono**, **Playwright (Chromium)**, and **TypeScript**, packaged for containerized deployment on **Docker** and **Render**.

---

## 📖 Live API Documentation & Interactive Demo

When the server is running, visit **[http://localhost:3000/docs](http://localhost:3000/docs)** (or the root URL **`/`**) in your browser to access:

* 🎮 **Interactive Live Playground**: Test real scraping requests with one click.
* 📖 **OpenAPI / Swagger Explorer**: Full endpoint parameters, schemas, and curl examples.
* ⚙️ **OpenAPI 3.1 Specification**: Accessible via `/openapi.json` and [`./openapi.yaml`](./openapi.yaml).
* 📑 **Offline Documentation**: Formatted markdown spec available in [`./API_SPEC.md`](./API_SPEC.md).

---

## 🏗 Architecture

```mermaid
flowchart TD
    Client["Client / Hiring Team / Evaluator"] -->|"HTTPS POST /v1/profile (x-api-key)"| Hono["Hono Web Server (Node.js)"]
    
    subgraph Container ["Docker / Render Container"]
        Hono -->|"1. Validate Request & API Key"| Middleware["Auth & Zod Middleware"]
        Middleware -->|"2. Acquire Concurrency Semaphore"| Manager["BrowserManager (Playwright)"]
        Manager -->|"3. New Context + StorageState"| Chromium["Chromium Instance"]
        Chromium -->|"4. Navigate Profile & Scroll"| Scraper["Profile Scraper"]
        Scraper -->|"5. Raw DOM & JSON-LD Extraction"| Normalizer["Parser / Normalizer"]
        Normalizer -->|"6. Structured JSON"| Hono
    end

    Hono -->|"200 OK (Clean Profile JSON)"| Client
```

---

## ⚡ Features

- **Interactive Playground & Swagger UI**: Built-in visual demo at `/docs` for easy evaluation.
- **Hono Web Framework**: High performance, minimal footprint, and first-class TypeScript support.
- **Playwright Automation**: Isolated browser contexts with authenticated session management (`storageState`).
- **Resilient Extraction**: Multi-layered section parsers with fallback to structured JSON-LD.
- **Strict Normalization**: Conforms to a clean schema (empty arrays `[]` for missing lists, `null` for missing scalars).
- **Concurrency & Resource Management**: Built-in semaphore control and automatic context cleanup.
- **Production Ready**: Full Docker configuration, `/health` endpoint, API key authentication, and Render deployment support.

---

## 📁 Repository Layout

```text
├── src/
│   ├── index.ts             # Server entrypoint & lifecycle shutdown
│   ├── app.ts               # Hono app definition, middleware & routing
│   ├── docs/
│   │   ├── openapi.ts       # OpenAPI 3.1.0 JSON specification
│   │   └── ui.ts            # Swagger UI & Interactive Live Demo UI
│   ├── routes/
│   │   └── profile.ts       # POST /v1/profile endpoint
│   ├── linkedin/
│   │   ├── browser.ts       # Chromium lifecycle & concurrency manager
│   │   ├── scraper.ts       # Page navigation, scrolling & extraction
│   │   └── parser.ts        # Section normalization & text cleaning
│   └── schemas/
│       └── profile.ts       # Request/Response schemas & Zod validation
├── scripts/
│   └── auth.ts              # Interactive CLI session capture script
├── test/
│   └── test-api.ts          # Unit & integration test suite
├── Dockerfile               # Production container definition
├── openapi.yaml             # Standalone OpenAPI 3.1 YAML definition
├── API_SPEC.md              # Detailed Markdown API specification
├── .dockerignore
├── .gitignore
├── .env.example             # Example environment configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **Node.js**: v20+ or v22+
- **npm**: v10+

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/Viswesh934/Tross-api-spec.git
cd Tross-api-spec

npm install
npx playwright install chromium --with-deps
```

### 3. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
API_KEY=test-challenge-api-key-2026
LINKEDIN_STORAGE_STATE=session.json
MAX_CONCURRENT_SCRAPES=2
SCRAPE_TIMEOUT_MS=35000
```

### 4. Start Server
```bash
npm start
```
Then open **[http://localhost:3000/docs](http://localhost:3000/docs)** to test the live demo!

---

## 🧪 Testing

Run the automated test suite verifying schemas, data normalization, error handling, and API routes:
```bash
npm test
```

---

## 🌐 API Specification

### 1. Health Check
Checks service availability and configuration state.

**Endpoint:** `GET /health`

```bash
curl -X GET http://localhost:3000/health
```

**Response (`200 OK`):**
```json
{
  "status": "healthy",
  "service": "linkedin-profile-api",
  "timestamp": "2026-08-29T17:35:00.000Z",
  "config": {
    "storageStateConfigured": true,
    "apiKeyConfigured": true,
    "maxConcurrency": 2
  }
}
```

---

### 2. Scrape Profile
Extracts structured information for a given LinkedIn profile URL.

**Endpoint:** `POST /v1/profile`

**Headers:**
- `Content-Type: application/json`
- `x-api-key: <YOUR_API_KEY>` (or `Authorization: Bearer <YOUR_API_KEY>`)

**Request Body:**
```json
{
  "url": "https://www.linkedin.com/in/williamhgates/"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/v1/profile \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-challenge-api-key-2026" \
  -d '{"url": "https://www.linkedin.com/in/williamhgates/"}'
```

**Response Schema (`200 OK`):**
```json
{
  "success": true,
  "profile": {
    "url": "https://www.linkedin.com/in/williamhgates/",
    "name": "Bill Gates",
    "headline": "Chair, Gates Foundation and Founder, Breakthrough Energy",
    "location": "Seattle, Washington, United States",
    "about": "Chair of the Gates Foundation. Founder of Breakthrough Energy. Co-founder of Microsoft.",
    "image": "https://media.licdn.com/dms/image/v2/D4E03AQEK3mRQ8nO4rA/profile-displayphoto-scale_100_100/...",
    "experience": [],
    "education": [],
    "skills": [
      "Software Engineering",
      "Philanthropy"
    ],
    "certifications": [],
    "languages": [
      {
        "language": "English",
        "proficiency": "Native or bilingual proficiency"
      }
    ]
  }
}
```

---

## 🐳 Docker Deployment

Build and run the container locally:

```bash
# Build the Docker image
docker build -t linkedin-profile-api .

# Run container with environment variables
docker run -d \
  -p 3000:3000 \
  -e API_KEY="test-challenge-api-key-2026" \
  -v $(pwd)/session.json:/app/session.json \
  -e LINKEDIN_STORAGE_STATE="/app/session.json" \
  --name linkedin-api \
  linkedin-profile-api
```

---

## ☁️ Render Deployment Instructions

1. Push your code to your GitHub repository (`Viswesh934/Tross-api-spec`).
2. Log into the [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** → **Web Service**.
4. Connect your GitHub repository.
5. Choose **Docker** as the Runtime.
6. Under **Environment Variables**, add:
   - `PORT`: `3000` (or Render default)
   - `API_KEY`: `<your-secure-api-key>`
   - `LINKEDIN_STORAGE_STATE`: Paste the entire content of `session.json` directly as a JSON string, or upload as a Secret File and set the path.
   - `MAX_CONCURRENT_SCRAPES`: `2`
   - `SCRAPE_TIMEOUT_MS`: `35000`
7. Click **Create Web Service**.
8. Render will build the container and provide your public URL: `https://<service-name>.onrender.com`.

---

## 🔒 Security & Privacy Notes

- **API Protection**: All extraction requests require a valid API key header.
- **Session Isolation**: Each scrape runs in a separate, isolated browser context.
- **No Data Retention**: Extracted profile information is returned in-memory and never written to disk or logs.
- **Safe Secrets Handling**: `session.json`, `*storage-state*.json`, and `.env` files are strictly excluded via `.gitignore` and `.dockerignore`.
- **Concurrency & Rate Limits**: Built-in semaphore prevents resource exhaustion on the host container.

---

## 📄 License
MIT
