import { z } from "zod";

/**
 * Regex matching valid LinkedIn profile URLs:
 * e.g. https://www.linkedin.com/in/williamhgates
 *      https://linkedin.com/in/satyanadella/
 *      https://uk.linkedin.com/in/someone-123/
 */
export const LINKEDIN_PROFILE_URL_REGEX = /^https?:\/\/(?:[a-zA-Z0-9-]+\.)?linkedin\.com\/in\/[a-zA-Z0-9_\-%À-ž]+\/?(?:[?#].*)?$/i;

export const ProfileRequestSchema = z.object({
  url: z
    .string({
      required_error: "URL is required",
      invalid_type_error: "URL must be a string",
    })
    .trim()
    .min(1, "URL cannot be empty")
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return LINKEDIN_PROFILE_URL_REGEX.test(val) && parsed.pathname.startsWith("/in/");
      } catch {
        return false;
      }
    }, {
      message: "Invalid LinkedIn profile URL. Example format: https://www.linkedin.com/in/username/",
    }),
});

export type ProfileRequest = z.infer<typeof ProfileRequestSchema>;

export interface ProfileExperience {
  title?: string | null;
  company?: string | null;
  employmentType?: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface ProfileEducation {
  school?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

export interface ProfileCertification {
  name?: string | null;
  issuer?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
}

export interface ProfileLanguage {
  language?: string | null;
  proficiency?: string | null;
}

export interface LinkedInProfile {
  url: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  image: string | null;
  experience: ProfileExperience[];
  education: ProfileEducation[];
  skills: string[];
  certifications: ProfileCertification[];
  languages: ProfileLanguage[];
}

export interface ProfileSuccessResponse {
  success: true;
  profile: LinkedInProfile;
}

export interface ProfileErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

export type ProfileResponse = ProfileSuccessResponse | ProfileErrorResponse;
