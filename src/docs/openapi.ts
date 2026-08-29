export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "LinkedIn Profile API",
    version: "1.0.0",
    description:
      "A fast, structured, pure HTTP API that takes a LinkedIn profile URL and returns structured profile information directly from LinkedIn's internal Voyager REST API (No browser, no Playwright).",
  },
  servers: [
    {
      url: "/",
      description: "Current environment",
    },
  ],
  paths: {
    "/health": {
      get: {
        summary: "Health Check",
        description: "Returns the health and operational status of the service.",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "healthy" },
                    service: { type: "string", example: "linkedin-profile-api" },
                    timestamp: { type: "string", example: "2026-08-29T18:00:00.000Z" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/profile": {
      get: {
        summary: "Fetch LinkedIn Profile (Query Param)",
        description:
          "Fetches a LinkedIn profile via query parameter 'url'. Requires API key if API_KEY environment variable is configured.",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        parameters: [
          {
            name: "url",
            in: "query",
            required: true,
            description: "LinkedIn profile URL or member handle",
            schema: {
              type: "string",
              example: "https://www.linkedin.com/in/username/",
            },
          },
        ],
        responses: {
          "200": {
            description: "Profile successfully fetched and structured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileSuccessResponse" },
              },
            },
          },
          "400": {
            description: "Invalid request or malformed URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized or missing/invalid session",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileErrorResponse" },
              },
            },
          },
          "404": {
            description: "Profile not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileErrorResponse" },
              },
            },
          },
        },
      },
      post: {
        summary: "Fetch LinkedIn Profile (JSON Body)",
        description:
          "Fetches and parses a LinkedIn profile using LinkedIn's internal Voyager REST API. Requires API key authentication.",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProfileRequest" },
              example: {
                url: "https://www.linkedin.com/in/username/",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Profile successfully fetched and structured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileSuccessResponse" },
              },
            },
          },
          "400": {
            description: "Invalid request format or invalid LinkedIn URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized or LinkedIn session required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileErrorResponse" },
              },
            },
          },
          "404": {
            description: "Profile not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "API Key Header Authentication",
      },
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Bearer Token Authentication",
      },
    },
    schemas: {
      ProfileRequest: {
        type: "object",
        required: ["url"],
        properties: {
          url: {
            type: "string",
            description: "The full LinkedIn profile URL or handle to extract",
            example: "https://www.linkedin.com/in/username/",
          },
        },
      },
      ProfileSuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          profile: { $ref: "#/components/schemas/LinkedInProfile" },
        },
      },
      ProfileErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string" },
          code: { type: "string" },
          details: { type: "array", items: { type: "object" } },
        },
      },
      LinkedInProfile: {
        type: "object",
        properties: {
          url: { type: "string", example: "https://www.linkedin.com/in/username/" },
          name: { type: "string", nullable: true },
          headline: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          about: { type: "string", nullable: true },
          image: { type: "string", nullable: true },
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
      },
      ProfileExperience: {
        type: "object",
        properties: {
          title: { type: "string", nullable: true },
          company: { type: "string", nullable: true },
          employmentType: { type: "string", nullable: true },
          duration: { type: "string", nullable: true },
          startDate: { type: "string", nullable: true },
          endDate: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
        },
      },
      ProfileEducation: {
        type: "object",
        properties: {
          school: { type: "string", nullable: true },
          degree: { type: "string", nullable: true },
          fieldOfStudy: { type: "string", nullable: true },
          duration: { type: "string", nullable: true },
          startDate: { type: "string", nullable: true },
          endDate: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
        },
      },
      ProfileCertification: {
        type: "object",
        properties: {
          name: { type: "string", nullable: true },
          issuer: { type: "string", nullable: true },
          issueDate: { type: "string", nullable: true },
          expirationDate: { type: "string", nullable: true },
          credentialId: { type: "string", nullable: true },
          credentialUrl: { type: "string", nullable: true },
        },
      },
      ProfileLanguage: {
        type: "object",
        properties: {
          language: { type: "string", nullable: true },
          proficiency: { type: "string", nullable: true },
        },
      },
    },
  },
};
