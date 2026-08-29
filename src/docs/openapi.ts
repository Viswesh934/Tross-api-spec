export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "LinkedIn Profile Scraper API",
    version: "1.0.0",
    description:
      "A fast, lightweight, and structured REST API for extracting standardized LinkedIn profile data using Hono, Playwright, and TypeScript.",
    contact: {
      name: "API Support",
      url: "https://github.com/Viswesh934/Tross-api-spec",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: "/",
      description: "Current Server (Local / Production)",
    },
    {
      url: "http://localhost:3000",
      description: "Local Development Server",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health Check",
        description: "Checks service status, uptime, and configuration readiness (including session and API key status).",
        operationId: "getHealth",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthResponse",
                },
                example: {
                  status: "healthy",
                  service: "linkedin-profile-api",
                  timestamp: "2026-08-29T17:30:00.000Z",
                  config: {
                    storageStateConfigured: true,
                    apiKeyConfigured: true,
                    maxConcurrency: 2,
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/profile": {
      post: {
        summary: "Scrape LinkedIn Profile",
        description:
          "Accepts a valid LinkedIn profile URL, navigates to the page using an authenticated Playwright session, extracts DOM and metadata, and returns a strictly normalized profile JSON.",
        operationId: "scrapeProfile",
        security: [
          { ApiKeyHeader: [] },
          { BearerAuth: [] },
        ],
        requestBody: {
          required: true,
          description: "LinkedIn Profile URL payload",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ProfileRequest",
              },
              example: {
                url: "https://www.linkedin.com/in/williamhgates/",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Profile successfully extracted and normalized",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProfileSuccessResponse",
                },
                example: {
                  success: true,
                  profile: {
                    url: "https://www.linkedin.com/in/williamhgates/",
                    name: "Bill Gates",
                    headline: "Chair, Gates Foundation and Founder, Breakthrough Energy",
                    location: "Seattle, Washington, United States",
                    about: "Chair of the Gates Foundation. Founder of Breakthrough Energy. Co-founder of Microsoft.",
                    image: "https://media.licdn.com/dms/image/v2/D4E03AQEK3mRQ8nO4rA/profile-displayphoto-scale_100_100/...",
                    experience: [
                      {
                        title: "Co-chair",
                        company: "Bill & Melinda Gates Foundation",
                        employmentType: "Full-time",
                        duration: "2000 - Present · 26 yrs",
                        startDate: "2000",
                        endDate: "Present",
                        location: "Seattle, WA",
                        description: "Guiding the foundation's strategic priorities.",
                      },
                    ],
                    education: [
                      {
                        school: "Harvard University",
                        degree: null,
                        fieldOfStudy: "Pre-law & Computer Science",
                        duration: "1973 - 1975",
                        startDate: "1973",
                        endDate: "1975",
                        description: null,
                      },
                    ],
                    skills: ["Software Engineering", "Philanthropy", "Leadership"],
                    certifications: [],
                    languages: [
                      {
                        language: "English",
                        proficiency: "Native or bilingual proficiency",
                      },
                    ],
                  },
                },
              },
            },
          },
          "400": {
            description: "Invalid request payload or malformed LinkedIn URL",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  success: false,
                  error: "Validation failed",
                  details: [
                    {
                      field: "url",
                      message: "Invalid LinkedIn profile URL. Example format: https://www.linkedin.com/in/username/",
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Unauthorized: Missing or invalid API key",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  success: false,
                  error: "Unauthorized: Missing or invalid API key. Provide via 'x-api-key' header or 'Authorization: Bearer <key>'.",
                },
              },
            },
          },
          "404": {
            description: "Profile not found or unavailable on LinkedIn",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  success: false,
                  error: "LinkedIn profile not found or unavailable",
                  code: "PROFILE_NOT_FOUND",
                },
              },
            },
          },
          "500": {
            description: "Scraper execution failure",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  success: false,
                  error: "An unexpected error occurred while scraping the LinkedIn profile.",
                },
              },
            },
          },
          "504": {
            description: "Scraping timeout",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse",
                },
                example: {
                  success: false,
                  error: "Timeout while loading or scraping LinkedIn profile",
                  code: "TIMEOUT",
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyHeader: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "API Key authentication passed via the 'x-api-key' HTTP header.",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Standard Bearer token authentication.",
      },
    },
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "healthy" },
          service: { type: "string", example: "linkedin-profile-api" },
          timestamp: { type: "string", format: "date-time" },
          config: {
            type: "object",
            properties: {
              storageStateConfigured: { type: "boolean", example: true },
              apiKeyConfigured: { type: "boolean", example: true },
              maxConcurrency: { type: "integer", example: 2 },
            },
          },
        },
        required: ["status", "service", "timestamp", "config"],
      },
      ProfileRequest: {
        type: "object",
        properties: {
          url: {
            type: "string",
            format: "uri",
            description: "Full HTTPS URL of the target LinkedIn profile",
            example: "https://www.linkedin.com/in/williamhgates/",
          },
        },
        required: ["url"],
      },
      ProfileExperience: {
        type: "object",
        properties: {
          title: { type: "string", nullable: true, example: "Chief Executive Officer" },
          company: { type: "string", nullable: true, example: "Microsoft" },
          employmentType: { type: "string", nullable: true, example: "Full-time" },
          duration: { type: "string", nullable: true, example: "Feb 2014 - Present · 10 yrs" },
          startDate: { type: "string", nullable: true, example: "Feb 2014" },
          endDate: { type: "string", nullable: true, example: "Present" },
          location: { type: "string", nullable: true, example: "Redmond, WA" },
          description: { type: "string", nullable: true, example: "Leading corporate strategy and global operations." },
        },
      },
      ProfileEducation: {
        type: "object",
        properties: {
          school: { type: "string", nullable: true, example: "University of Chicago Booth School of Business" },
          degree: { type: "string", nullable: true, example: "Master of Business Administration - MBA" },
          fieldOfStudy: { type: "string", nullable: true, example: "Business Administration" },
          duration: { type: "string", nullable: true, example: "1994 - 1997" },
          startDate: { type: "string", nullable: true, example: "1994" },
          endDate: { type: "string", nullable: true, example: "1997" },
          description: { type: "string", nullable: true, example: null },
        },
      },
      ProfileCertification: {
        type: "object",
        properties: {
          name: { type: "string", nullable: true, example: "AWS Certified Solutions Architect" },
          issuer: { type: "string", nullable: true, example: "Amazon Web Services (AWS)" },
          issueDate: { type: "string", nullable: true, example: "Jan 2023" },
          expirationDate: { type: "string", nullable: true, example: null },
          credentialId: { type: "string", nullable: true, example: "AWS-12345678" },
          credentialUrl: { type: "string", nullable: true, example: null },
        },
      },
      ProfileLanguage: {
        type: "object",
        properties: {
          language: { type: "string", nullable: true, example: "English" },
          proficiency: { type: "string", nullable: true, example: "Native or bilingual proficiency" },
        },
      },
      LinkedInProfile: {
        type: "object",
        properties: {
          url: { type: "string", example: "https://www.linkedin.com/in/example/" },
          name: { type: "string", nullable: true, example: "Satya Nadella" },
          headline: { type: "string", nullable: true, example: "Chairman and CEO at Microsoft" },
          location: { type: "string", nullable: true, example: "Redmond, Washington, United States" },
          about: { type: "string", nullable: true, example: "Believing in the power of technology..." },
          image: { type: "string", nullable: true, example: "https://media.licdn.com/dms/image/..." },
          experience: {
            type: "array",
            items: { $ref: "#/components/schemas/ProfileExperience" },
          },
          education: {
            type: "array",
            items: { $ref: "#/components/schemas/ProfileEducation" },
          },
          skills: {
            type: "array",
            items: { type: "string" },
            example: ["Cloud Computing", "Leadership", "AI"],
          },
          certifications: {
            type: "array",
            items: { $ref: "#/components/schemas/ProfileCertification" },
          },
          languages: {
            type: "array",
            items: { $ref: "#/components/schemas/ProfileLanguage" },
          },
        },
        required: ["url", "experience", "education", "skills", "certifications", "languages"],
      },
      ProfileSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          profile: { $ref: "#/components/schemas/LinkedInProfile" },
        },
        required: ["success", "profile"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string", example: "Error message description" },
          code: { type: "string", example: "ERROR_CODE" },
          details: { type: "array", items: { type: "object" } },
        },
        required: ["success", "error"],
      },
    },
  },
};
