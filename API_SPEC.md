# LinkedIn Profile API - Technical Specification

## Overview

The **LinkedIn Profile API** is a high-performance, reverse-engineered HTTP service built with **Hono**, **TypeScript**, and **Node.js**.

It directly interfaces with LinkedIn's internal **Voyager REST API** (`/voyager/api/identity/dash/profiles`) using standard authenticated HTTP requests (**Pure HTTP, no browser / no Playwright / no Chromium**).

---

## Authentication & Security

1. **API Key Authentication**:
   - Clients must provide a valid API key via `x-api-key: <key>` or `Authorization: Bearer <key>` when `API_KEY` is configured in the environment.
2. **LinkedIn Session Authentication**:
   - The service authenticates with LinkedIn via the `li_at` cookie and `csrf-token` header loaded from `LINKEDIN_LI_AT`, `LINKEDIN_STORAGE_STATE`, or secret files (e.g. `/etc/secrets/session.json`).

---

## Endpoints

### 1. Health Check
* **Method**: `GET`
* **Path**: `/health`
* **Response (`200 OK`)**:
  ```json
  {
    "status": "healthy",
    "service": "linkedin-profile-api",
    "timestamp": "2026-08-29T18:00:00.000Z"
  }
  ```

---

### 2. Fetch Profile (Query Parameter)
* **Method**: `GET`
* **Path**: `/v1/profile?url=https://www.linkedin.com/in/username/`
* **Headers**: `x-api-key: <API_KEY>`

---

### 3. Fetch Profile (JSON Body)
* **Method**: `POST`
* **Path**: `/v1/profile`
* **Headers**: `Content-Type: application/json`, `x-api-key: <API_KEY>`
* **Request Body**:
  ```json
  {
    "url": "https://www.linkedin.com/in/username/"
  }
  ```

---

### 4. Target Response Contract

```json
{
  "success": true,
  "profile": {
    "url": "https://www.linkedin.com/in/username/",
    "name": "Alex Smith",
    "headline": "Principal Software Engineer",
    "location": "San Francisco Bay Area",
    "about": "Passionate backend engineer building distributed systems.",
    "image": "https://media.licdn.com/dms/image/v2/...",
    "experience": [
      {
        "title": "Principal Software Engineer",
        "company": "Cloud Tech Inc",
        "employmentType": "Full-time",
        "duration": "Jan 2021 - Present",
        "startDate": "Jan 2021",
        "endDate": "Present",
        "location": "San Francisco, CA",
        "description": "Leading architecture for high-throughput messaging pipelines."
      }
    ],
    "education": [
      {
        "school": "University of California, Berkeley",
        "degree": "Bachelor of Science",
        "fieldOfStudy": "Computer Science",
        "duration": "2016 - 2020",
        "startDate": "2016",
        "endDate": "2020",
        "description": null
      }
    ],
    "skills": [
      "TypeScript",
      "Node.js",
      "Distributed Systems",
      "PostgreSQL"
    ],
    "certifications": [
      {
        "name": "AWS Certified Solutions Architect - Professional",
        "issuer": "Amazon Web Services (AWS)",
        "issueDate": "Jan 2023",
        "expirationDate": null,
        "credentialId": "AWS-CERT-987654",
        "credentialUrl": null
      }
    ],
    "languages": [
      {
        "language": "English",
        "proficiency": "Native or bilingual"
      }
    ]
  }
}
```

---

## Error Handling

All errors return JSON with HTTP status codes:

```json
{
  "success": false,
  "error": "LinkedIn profile 'invalid-user' was not found.",
  "code": "PROFILE_NOT_FOUND"
}
```

| HTTP Status | Code | Description |
|---|---|---|
| `400` | `VALIDATION_FAILED` | Malformed URL or missing request parameters |
| `401` | `UNAUTHORIZED` | Missing or invalid `x-api-key` header |
| `401` | `SESSION_EXPIRED` | LinkedIn session cookie expired |
| `401` | `SESSION_CHALLENGED`| LinkedIn verification checkpoint triggered |
| `404` | `PROFILE_NOT_FOUND` | Member profile not found on LinkedIn |
| `429` | `RATE_LIMITED` | LinkedIn rate limit exceeded |
| `500` | `REQUEST_FAILED` | Unexpected internal upstream error |
