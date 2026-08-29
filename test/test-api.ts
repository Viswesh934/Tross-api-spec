import { parseVoyagerResponse, formatVoyagerDate } from "../src/linkedin/parser.js";
import { extractUsername } from "../src/linkedin/client.js";
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

  // 1. Helper & Client Tests
  console.log("1. Helper & URL Extraction Tests");
  await test("extractUsername correctly extracts handles from URLs", () => {
    assert.strictEqual(extractUsername("https://www.linkedin.com/in/williamhgates/"), "williamhgates");
    assert.strictEqual(extractUsername("https://linkedin.com/in/satyanadella?trk=feed"), "satyanadella");
    assert.strictEqual(extractUsername("ada-lovelace"), "ada-lovelace");
  });

  await test("formatVoyagerDate formats {year, month} correctly", () => {
    assert.strictEqual(formatVoyagerDate({ year: 2021, month: 3 }), "Mar 2021");
    assert.strictEqual(formatVoyagerDate({ year: 2018 }), "2018");
    assert.strictEqual(formatVoyagerDate(null), null);
  });

  // 2. Voyager Parser Tests
  console.log("\n2. Voyager Normalizer & Schema Compliance Tests");
  await test("parseVoyagerResponse parses empty payload gracefully", () => {
    const res = parseVoyagerResponse({}, "https://www.linkedin.com/in/test-user/");
    assert.strictEqual(res.url, "https://www.linkedin.com/in/test-user/");
    assert.strictEqual(res.name, null);
    assert.strictEqual(res.headline, null);
    assert.strictEqual(res.location, null);
    assert.strictEqual(res.about, null);
    assert.strictEqual(res.image, null);
    assert.deepStrictEqual(res.experience, []);
    assert.deepStrictEqual(res.education, []);
    assert.deepStrictEqual(res.skills, []);
    assert.deepStrictEqual(res.certifications, []);
    assert.deepStrictEqual(res.languages, []);
  });

  await test("parseVoyagerResponse parses complete Voyager entity graph", () => {
    const mockPayload = {
      included: [
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Profile",
          firstName: "Ada",
          lastName: "Lovelace",
          headline: "Chief Mathematician & Pioneer",
          summary: "First computer programmer.",
          geoLocationName: "London, England, United Kingdom",
          profilePicture: {
            displayImageReference: {
              vectorImage: {
                rootUrl: "https://media.licdn.com/dms/image/v2/test/",
                artifacts: [
                  { width: 100, fileIdentifyingUrlPathSegment: "100.jpg" },
                  { width: 400, fileIdentifyingUrlPathSegment: "400.jpg" },
                ],
              },
            },
          },
        },
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Position",
          title: "Principal Engineer",
          companyName: "Analytical Systems Ltd",
          employmentType: "Full-time",
          locationName: "London, UK",
          dateRange: { start: { year: 1842, month: 3 }, end: { year: 1852, month: 11 } },
          description: "Engine design and notes.",
        },
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Education",
          schoolName: "University of London",
          degreeName: "Hon. Doctorate",
          fieldOfStudy: "Mathematics",
          dateRange: { start: { year: 1832 }, end: { year: 1840 } },
        },
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Skill",
          name: "Algorithmic Design",
        },
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Certification",
          name: "Taylor Scientific Translation",
          authority: "Scientific Memoirs",
          timePeriod: { start: { year: 1843, month: 1 } },
          licenseNumber: "MEMOIR-001",
        },
        {
          $type: "com.linkedin.voyager.dash.identity.profile.Language",
          name: "French",
          proficiency: "Professional working",
        },
      ],
    };

    const res = parseVoyagerResponse(mockPayload, "https://www.linkedin.com/in/ada-lovelace");
    assert.strictEqual(res.name, "Ada Lovelace");
    assert.strictEqual(res.headline, "Chief Mathematician & Pioneer");
    assert.strictEqual(res.location, "London, England, United Kingdom");
    assert.strictEqual(res.image, "https://media.licdn.com/dms/image/v2/test/400.jpg");
    assert.strictEqual(res.experience.length, 1);
    assert.strictEqual(res.experience[0].title, "Principal Engineer");
    assert.strictEqual(res.experience[0].duration, "Mar 1842 - Nov 1852");
    assert.strictEqual(res.education.length, 1);
    assert.strictEqual(res.education[0].school, "University of London");
    assert.strictEqual(res.skills.length, 1);
    assert.strictEqual(res.skills[0], "Algorithmic Design");
    assert.strictEqual(res.certifications.length, 1);
    assert.strictEqual(res.languages.length, 1);
  });

  // 3. Schema & URL Validation Tests
  console.log("\n3. Schema & URL Validation Tests");
  await test("ProfileRequestSchema accepts valid LinkedIn profile URLs", () => {
    const validUrls = [
      "https://www.linkedin.com/in/williamhgates/",
      "https://linkedin.com/in/satyanadella",
      "https://uk.linkedin.com/in/john-doe-123456",
      "https://www.linkedin.com/in/user_name?trackingId=123",
      "ada-lovelace",
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
      "",
    ];

    for (const url of invalidUrls) {
      const res = ProfileRequestSchema.safeParse({ url });
      assert.strictEqual(res.success, false, `Expected invalid: ${url}`);
    }
  });

  // 4. HTTP API Endpoint Tests
  console.log("\n4. HTTP API Endpoint Tests");
  await test("GET / returns 200 with clean UI HTML", async () => {
    const res = await app.request("/");
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("LinkedIn Profile API"));
    assert.ok(html.includes("LinkedIn Profile URL"));
  });

  await test("GET /openapi.json returns 200 with OpenAPI 3.1 schema", async () => {
    const res = await app.request("/openapi.json");
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.openapi, "3.1.0");
    assert.ok(json.paths["/v1/profile"]);
  });

  await test("GET /health returns 200 healthy status", async () => {
    const res = await app.request("/health");
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "healthy");
    assert.strictEqual(body.service, "linkedin-profile-api");
  });

  await test("GET /v1/profile with fixture URL returns 200 profile response", async () => {
    const res = await app.request("/v1/profile?url=https://www.linkedin.com/in/ada-lovelace");
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.profile.name, "Ada Lovelace");
    assert.strictEqual(body.profile.experience.length, 1);
  });

  await test("POST /api/demo with fixture URL returns 200", async () => {
    const res = await app.request("/api/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.linkedin.com/in/ada-lovelace" }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.profile.name, "Ada Lovelace");
  });

  await test("POST /v1/profile rejects request when API_KEY is set and header is missing", async () => {
    process.env.API_KEY = "test-secret-key-123";

    const res = await app.request("/v1/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.linkedin.com/in/ada-lovelace" }),
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);

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
