# LinkedIn Profile API — Specification & Demo Guide

This document contains the complete REST API specification, OpenAPI definitions, response schemas, and interactive demo instructions for evaluators and the hiring team.

---

## 🎯 Overview

- **Base URL (Local)**: `http://localhost:3000`
- **Interactive UI & Playground**: `http://localhost:3000/docs` (or `http://localhost:3000/`)
- **OpenAPI 3.1 Spec (JSON)**: `http://localhost:3000/openapi.json`
- **OpenAPI 3.1 Spec (YAML)**: [`./openapi.yaml`](./openapi.yaml)

---

## 🎮 Interactive Live Demo Playground

The API includes a built-in interactive web UI and OpenAPI/Swagger explorer:

1. Start the server: `npm start`
2. Open **[http://localhost:3000/docs](http://localhost:3000/docs)** in any web browser.
3. You can:
   - Use the **Interactive Live Demo** to paste any LinkedIn URL, enter the API key, and test scraping with one click.
   - Explore the **Swagger UI** with full schemas, response codes, and curl snippets.
   - Inspect or download the raw **OpenAPI 3.1 JSON / YAML** specification.

---

## 🔑 Authentication

Protected endpoints require an API Key supplied via either:
- **Header**: `x-api-key: <YOUR_API_KEY>`
- **Authorization Header**: `Authorization: Bearer <YOUR_API_KEY>`

---

## 📡 Endpoints

### 1. Health Check
Checks service health, Playwright browser readiness, and configuration state.

- **Method**: `GET`
- **Path**: `/health`
- **Authentication**: None required

#### Example Request:
```bash
curl -X GET http://localhost:3000/health
```

#### Example Response (`200 OK`):
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
Extracts and normalizes public and authenticated profile data from a LinkedIn profile URL.

- **Method**: `POST`
- **Path**: `/v1/profile`
- **Authentication**: `x-api-key: <API_KEY>` or `Authorization: Bearer <API_KEY>`
- **Headers**: `Content-Type: application/json`

#### Request Body Schema:
```json
{
  "url": "https://www.linkedin.com/in/username/"
}
```

#### Example Request:
```bash
curl -X POST http://localhost:3000/v1/profile \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-challenge-api-key-2026" \
  -d '{"url": "https://www.linkedin.com/in/williamhgates/"}'
```

#### Success Response (`200 OK`):
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
    "experience": [
      {
        "title": "Co-chair",
        "company": "Bill & Melinda Gates Foundation",
        "employmentType": "Full-time",
        "duration": "2000 - Present · 26 yrs",
        "startDate": "2000",
        "endDate": "Present",
        "location": "Seattle, WA",
        "description": "Guiding global health and development initiatives."
      }
    ],
    "education": [
      {
        "school": "Harvard University",
        "degree": null,
        "fieldOfStudy": "Pre-law & Computer Science",
        "duration": "1973 - 1975",
        "startDate": "1973",
        "endDate": "1975",
        "description": null
      }
    ],
    "skills": [
      "Software Engineering",
      "Philanthropy",
      "Strategic Planning"
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

## 🛑 Error Responses

| Status Code | Description | Example Payload |
|---|---|---|
| `400 Bad Request` | Invalid payload or non-LinkedIn URL | `{"success": false, "error": "Validation failed", "details": [...]}` |
| `401 Unauthorized` | Missing or invalid API key | `{"success": false, "error": "Unauthorized: Missing or invalid API key"}` |
| `404 Not Found` | Profile does not exist | `{"success": false, "error": "LinkedIn profile not found", "code": "PROFILE_NOT_FOUND"}` |
| `500 Server Error` | Scraper or runtime issue | `{"success": false, "error": "Scraping failed: ...", "code": "SCRAPE_FAILED"}` |
| `504 Gateway Timeout` | LinkedIn page took too long | `{"success": false, "error": "Timeout while scraping profile", "code": "TIMEOUT"}` |

---

## 📋 Schema Rules & Guarantees

1. **No Invented Data**: If a field is not present on the profile, it is returned as `null`.
2. **Deterministic Arrays**: Absent sections (e.g. no certifications listed) always return empty arrays (`[]`), never `null` or `undefined`.
3. **Deduplication**: Extracted skills and languages are trimmed and deduplicated.
