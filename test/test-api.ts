import { normalizeProfile, cleanText, parseDateRange } from "../src/linkedin/parser.js";
import { ProfileRequestSchema } from "../src/schemas/profile.js";
import { app } from "../src/app.js";
import assert from "node:assert";

async function runTests() {
  console.log("==========================================");
  console.log("   LinkedIn Profile API - Test Suite      ");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // 1. Text Cleaner Tests
  console.log("1. Text Cleaner & Helper Tests");
  await test("cleanText strips '...see more' artifacts and excess whitespace", () => {
    const input = "  Senior Software Engineer\n\n… see more  ";
    const output = cleanText(input);
    assert.strictEqual(output, "Senior Software Engineer");
  });

  await test("cleanText returns null for empty or whitespace-only inputs", () => {
    assert.strictEqual(cleanText("   "), null);
    assert.strictEqual(cleanText(null), null);
    assert.strictEqual(cleanText(undefined), null);
  });

  await test("parseDateRange correctly splits date range and duration", () => {
    const res = parseDateRange("Jan 2021 - Present · 3 yrs 2 mos");
    assert.strictEqual(res.startDate, "Jan 2021");
    assert.strictEqual(res.endDate, "Present");
    assert.strictEqual(res.duration, "3 yrs 2 mos");
  });

  // 2. Normalizer & Schema Compliance Tests
  console.log("\n2. Normalizer & Contract Compliance Tests");
  await test("normalizeProfile returns empty arrays for missing array sections and null for missing scalars", () => {
    const normalized = normalizeProfile({}, "https://www.linkedin.com/in/test-user/");
    assert.strictEqual(normalized.url, "https://www.linkedin.com/in/test-user/");
    assert.strictEqual(normalized.name, null);
    assert.strictEqual(normalized.headline, null);
    assert.strictEqual(normalized.location, null);
    assert.strictEqual(normalized.about, null);
    assert.strictEqual(normalized.image, null);
    assert.deepStrictEqual(normalized.experience, []);
    assert.deepStrictEqual(normalized.education, []);
    assert.deepStrictEqual(normalized.skills, []);
    assert.deepStrictEqual(normalized.certifications, []);
    assert.deepStrictEqual(normalized.languages, []);
  });

  await test("normalizeProfile handles fully populated raw data accurately", () => {
    const raw = {
      name: "Satya Nadella",
      headline: "Chairman and CEO at Microsoft",
      location: "Redmond, Washington, United States",
      about: "Believing in the power of technology to empower every person and organization.",
      image: "https://media.licdn.com/dms/image/v2/test/profile.jpg",
      experience: [
        {
          title: "Chief Executive Officer",
          company: "Microsoft · Full-time",
          duration: "Feb 2014 - Present · 10 yrs 6 mos",
          location: "Redmond, WA",
          description: "Leading Microsoft",
        },
      ],
      education: [
        {
          school: "University of Chicago Booth School of Business",
          degree: "Master of Business Administration - MBA",
          duration: "1994 - 1997",
        },
      ],
      skills: ["Cloud Computing", "Leadership", "AI", "Cloud Computing"], // duplicate skill
      certifications: [
        {
          name: "AWS Certified Solutions Architect",
          issuer: "Amazon Web Services",
          issueDate: "Issued Jan 2023",
        },
      ],
      languages: [
        {
          language: "English",
          proficiency: "Native or bilingual proficiency",
        },
      ],
    };

    const normalized = normalizeProfile(raw, "https://www.linkedin.com/in/satyanadella/");

    assert.strictEqual(normalized.name, "Satya Nadella");
    assert.strictEqual(normalized.headline, "Chairman and CEO at Microsoft");
    assert.strictEqual(normalized.experience.length, 1);
    assert.strictEqual(normalized.experience[0].title, "Chief Executive Officer");
    assert.strictEqual(normalized.education.length, 1);
    assert.strictEqual(normalized.education[0].school, "University of Chicago Booth School of Business");
    assert.strictEqual(normalized.skills.length, 3); // deduplicated
    assert.strictEqual(normalized.certifications.length, 1);
    assert.strictEqual(normalized.languages.length, 1);
  });

  await test("normalizeProfile fallback enriches missing fields from JSON-LD schema", () => {
    const raw = {
      jsonLd: {
        name: "Bill Gates",
        jobTitle: "Co-chair, Bill & Melinda Gates Foundation",
        description: "Co-chair of the Bill & Melinda Gates Foundation",
        image: "https://media.licdn.com/bill.jpg",
        address: {
          addressLocality: "Seattle",
          addressRegion: "WA",
          addressCountry: "USA",
        },
      },
    };

    const normalized = normalizeProfile(raw, "https://www.linkedin.com/in/williamhgates/");
    assert.strictEqual(normalized.name, "Bill Gates");
    assert.strictEqual(normalized.headline, "Co-chair, Bill & Melinda Gates Foundation");
    assert.strictEqual(normalized.about, "Co-chair of the Bill & Melinda Gates Foundation");
    assert.strictEqual(normalized.image, "https://media.licdn.com/bill.jpg");
    assert.strictEqual(normalized.location, "Seattle, WA, USA");
  });

  // 3. Schema & URL Validation Tests
  console.log("\n3. Schema & URL Validation Tests");
  await test("ProfileRequestSchema accepts valid LinkedIn profile URLs", () => {
    const validUrls = [
      "https://www.linkedin.com/in/williamhgates/",
      "https://linkedin.com/in/satyanadella",
      "https://uk.linkedin.com/in/john-doe-123456",
      "https://www.linkedin.com/in/user_name?trackingId=123",
    ];

    for (const url of validUrls) {
      const res = ProfileRequestSchema.safeParse({ url });
      assert.strictEqual(res.success, true, `Expected valid: ${url}`);
    }
  });

  await test("ProfileRequestSchema rejects invalid URLs", () => {
    const invalidUrls = [
      "https://google.com",
      "https://www.linkedin.com/company/microsoft/",
      "https://www.linkedin.com/feed/",
      "not-a-url",
      "",
    ];

    for (const url of invalidUrls) {
      const res = ProfileRequestSchema.safeParse({ url });
      assert.strictEqual(res.success, false, `Expected invalid: ${url}`);
    }
  });

  // 4. Hono HTTP Integration Tests
  console.log("\n4. HTTP API Endpoint Tests");
  await test("GET / returns 200 with API info", async () => {
    const res = await app.request("/");
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.name, "LinkedIn Profile API");
  });

  await test("GET /health returns 200 healthy status", async () => {
    const res = await app.request("/health");
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "healthy");
    assert.strictEqual(body.service, "linkedin-profile-api");
  });

  await test("GET /unknown-path returns 404 with JSON error", async () => {
    const res = await app.request("/unknown-path");
    assert.strictEqual(res.status, 404);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  await test("POST /v1/profile with invalid URL returns 400 Bad Request", async () => {
    const res = await app.request("/v1/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/not-linkedin" }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, "Validation failed");
  });

  await test("POST /v1/profile with malformed JSON body returns 400", async () => {
    const res = await app.request("/v1/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid-json",
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  await test("POST /v1/profile rejects request when API_KEY is set and header is missing", async () => {
    process.env.API_KEY = "test-secret-key-123";

    const res = await app.request("/v1/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.linkedin.com/in/testuser/" }),
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.error.includes("Unauthorized"));

    // Cleanup
    delete process.env.API_KEY;
  });

  await test("POST /v1/profile accepts valid API key in x-api-key header", async () => {
    process.env.API_KEY = "test-secret-key-123";

    const res = await app.request("/v1/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-secret-key-123",
      },
      body: JSON.stringify({ url: "invalid-url" }),
    });

    // Should pass auth and fail on URL validation (400) rather than auth (401)
    assert.strictEqual(res.status, 400);

    // Cleanup
    delete process.env.API_KEY;
  });

  console.log("\n==========================================");
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("==========================================");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
