import type {
  LinkedInProfile,
  ProfileCertification,
  ProfileEducation,
  ProfileExperience,
  ProfileLanguage,
} from "../schemas/profile.js";

/**
 * Raw extracted section data from the browser DOM
 */
export interface RawProfileData {
  url?: string;
  name?: string | null;
  headline?: string | null;
  location?: string | null;
  about?: string | null;
  image?: string | null;
  experience?: RawExperienceItem[];
  education?: RawEducationItem[];
  skills?: string[];
  certifications?: RawCertificationItem[];
  languages?: RawLanguageItem[];
  jsonLd?: Record<string, any> | null;
}

export interface RawExperienceItem {
  title?: string | null;
  company?: string | null;
  employmentType?: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  rawTextLines?: string[];
}

export interface RawEducationItem {
  school?: string | null;
  degree?: string | null;
  fieldOfStudy?: string | null;
  duration?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
  rawTextLines?: string[];
}

export interface RawCertificationItem {
  name?: string | null;
  issuer?: string | null;
  issueDate?: string | null;
  expirationDate?: string | null;
  credentialId?: string | null;
  credentialUrl?: string | null;
  rawTextLines?: string[];
}

export interface RawLanguageItem {
  language?: string | null;
  proficiency?: string | null;
  rawTextLines?: string[];
}

/**
 * Helper to clean up strings:
 * - Trims extra whitespace
 * - Strips "see more" / "...see more" / "…see more" artifacts
 * - Returns null if empty
 */
export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/…\s*see more/gi, "")
    .replace(/\.\.\.\s*see more/gi, "")
    .replace(/\bsee more\b/gi, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Parse date ranges like "Jan 2021 - Present · 3 yrs 2 mos" or "2018 - 2022"
 */
export function parseDateRange(dateStr: string | null | undefined): {
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
} {
  if (!dateStr) {
    return { startDate: null, endDate: null, duration: null };
  }

  const cleaned = cleanText(dateStr);
  if (!cleaned) {
    return { startDate: null, endDate: null, duration: null };
  }

  // Format: "Jan 2021 - Present · 3 yrs 2 mos" or "2018 - 2022"
  const parts = cleaned.split("·").map((p) => p.trim());
  const datesPart = parts[0] || cleaned;
  const duration = parts.length > 1 ? parts.slice(1).join(" · ").trim() : null;

  const dateSplit = datesPart.split(/\s*[-–—]\s*/);
  const startDate = cleanText(dateSplit[0]) || null;
  const endDate = dateSplit.length > 1 ? cleanText(dateSplit[1]) : null;

  return {
    startDate,
    endDate,
    duration: cleanText(duration),
  };
}

/**
 * Parse raw experience item from list lines if individual fields were not fully structured
 */
export function normalizeExperienceItem(item: RawExperienceItem): ProfileExperience {
  let {
    title = null,
    company = null,
    employmentType = null,
    duration = null,
    startDate = null,
    endDate = null,
    location = null,
    description = null,
    rawTextLines = [],
  } = item;

  // If structured fields missing but raw lines exist, infer fields
  if (!title && rawTextLines.length > 0) {
    const lines = rawTextLines.map((l) => cleanText(l)).filter((l): l is string => Boolean(l));
    if (lines.length >= 1) title = lines[0];
    if (lines.length >= 2) {
      const compLine = lines[1];
      if (compLine.includes("·")) {
        const [cName, eType] = compLine.split("·").map((s) => s.trim());
        company = cName;
        employmentType = eType;
      } else {
        company = compLine;
      }
    }
    if (lines.length >= 3) {
      const dates = parseDateRange(lines[2]);
      startDate = dates.startDate;
      endDate = dates.endDate;
      duration = dates.duration;
    }
    if (lines.length >= 4 && !lines[3].toLowerCase().startsWith("skills:")) {
      location = lines[3];
    }
    if (lines.length >= 5) {
      description = lines.slice(4).join("\n");
    }
  }

  // Parse duration if raw duration string contains date split
  if (duration && !startDate && !endDate && (duration.includes("-") || duration.includes("–"))) {
    const dates = parseDateRange(duration);
    startDate = dates.startDate;
    endDate = dates.endDate;
    duration = dates.duration;
  }

  return {
    title: cleanText(title),
    company: cleanText(company),
    employmentType: cleanText(employmentType),
    duration: cleanText(duration),
    startDate: cleanText(startDate),
    endDate: cleanText(endDate),
    location: cleanText(location),
    description: cleanText(description),
  };
}

/**
 * Parse raw education item from list lines
 */
export function normalizeEducationItem(item: RawEducationItem): ProfileEducation {
  let {
    school = null,
    degree = null,
    fieldOfStudy = null,
    duration = null,
    startDate = null,
    endDate = null,
    description = null,
    rawTextLines = [],
  } = item;

  if (!school && rawTextLines.length > 0) {
    const lines = rawTextLines.map((l) => cleanText(l)).filter((l): l is string => Boolean(l));
    if (lines.length >= 1) school = lines[0];
    if (lines.length >= 2) {
      const degLine = lines[1];
      if (degLine.includes(",")) {
        const [dName, fStudy] = degLine.split(",").map((s) => s.trim());
        degree = dName;
        fieldOfStudy = fStudy;
      } else {
        degree = degLine;
      }
    }
    if (lines.length >= 3) {
      const dates = parseDateRange(lines[2]);
      startDate = dates.startDate;
      endDate = dates.endDate;
      duration = dates.duration || lines[2];
    }
    if (lines.length >= 4) {
      description = lines.slice(3).join("\n");
    }
  }

  if (duration && !startDate && !endDate && (duration.includes("-") || duration.includes("–"))) {
    const dates = parseDateRange(duration);
    startDate = dates.startDate;
    endDate = dates.endDate;
    duration = dates.duration || duration;
  }

  return {
    school: cleanText(school),
    degree: cleanText(degree),
    fieldOfStudy: cleanText(fieldOfStudy),
    duration: cleanText(duration),
    startDate: cleanText(startDate),
    endDate: cleanText(endDate),
    description: cleanText(description),
  };
}

/**
 * Parse raw certification item
 */
export function normalizeCertificationItem(item: RawCertificationItem): ProfileCertification {
  let {
    name = null,
    issuer = null,
    issueDate = null,
    expirationDate = null,
    credentialId = null,
    credentialUrl = null,
    rawTextLines = [],
  } = item;

  if (!name && rawTextLines.length > 0) {
    const lines = rawTextLines.map((l) => cleanText(l)).filter((l): l is string => Boolean(l));
    if (lines.length >= 1) name = lines[0];
    if (lines.length >= 2) issuer = lines[1];
    if (lines.length >= 3) {
      const issueLine = lines[2];
      if (issueLine.toLowerCase().includes("issued")) {
        issueDate = issueLine.replace(/issued\s*/i, "").trim();
      } else {
        issueDate = issueLine;
      }
    }
    if (lines.length >= 4) {
      const credLine = lines[3];
      if (credLine.toLowerCase().includes("credential id")) {
        credentialId = credLine.replace(/credential id\s*/i, "").trim();
      }
    }
  }

  return {
    name: cleanText(name),
    issuer: cleanText(issuer),
    issueDate: cleanText(issueDate),
    expirationDate: cleanText(expirationDate),
    credentialId: cleanText(credentialId),
    credentialUrl: cleanText(credentialUrl),
  };
}

/**
 * Parse raw language item
 */
export function normalizeLanguageItem(item: RawLanguageItem): ProfileLanguage {
  let { language = null, proficiency = null, rawTextLines = [] } = item;

  if (!language && rawTextLines.length > 0) {
    const lines = rawTextLines.map((l) => cleanText(l)).filter((l): l is string => Boolean(l));
    if (lines.length >= 1) language = lines[0];
    if (lines.length >= 2) proficiency = lines[1];
  }

  return {
    language: cleanText(language),
    proficiency: cleanText(proficiency),
  };
}

/**
 * Main normalizer that transforms raw scraped data into the final target LinkedInProfile schema
 */
export function normalizeProfile(raw: RawProfileData, profileUrl: string): LinkedInProfile {
  // Extract or fallback from JSON-LD if top-level fields are missing
  let name = cleanText(raw.name);
  let headline = cleanText(raw.headline);
  let location = cleanText(raw.location);
  let about = cleanText(raw.about);
  let image = cleanText(raw.image);

  if (raw.jsonLd) {
    const ld = raw.jsonLd;
    if (!name && ld.name) name = cleanText(ld.name);
    if (!headline && ld.jobTitle) headline = cleanText(ld.jobTitle);
    if (!about && ld.description) about = cleanText(ld.description);
    if (!image && ld.image) {
      image = typeof ld.image === "string" ? cleanText(ld.image) : cleanText(ld.image.url || ld.image.contentUrl);
    }
    if (!location && ld.address) {
      if (typeof ld.address === "string") {
        location = cleanText(ld.address);
      } else if (typeof ld.address === "object") {
        const locParts = [ld.address.addressLocality, ld.address.addressRegion, ld.address.addressCountry].filter(Boolean);
        if (locParts.length > 0) location = locParts.join(", ");
      }
    }
  }

  // Filter and normalize experience items
  const experience: ProfileExperience[] = (raw.experience || [])
    .map(normalizeExperienceItem)
    .filter((exp) => Boolean(exp.title || exp.company || exp.description));

  // Filter and normalize education items
  const education: ProfileEducation[] = (raw.education || [])
    .map(normalizeEducationItem)
    .filter((edu) => Boolean(edu.school || edu.degree || edu.fieldOfStudy));

  // Clean and deduplicate skills
  const skills: string[] = Array.from(
    new Set(
      (raw.skills || [])
        .map((s) => cleanText(s))
        .filter((s): s is string => typeof s === "string" && s.length > 0 && s.length < 100)
    )
  );

  // Filter and normalize certifications
  const certifications: ProfileCertification[] = (raw.certifications || [])
    .map(normalizeCertificationItem)
    .filter((cert) => Boolean(cert.name || cert.issuer));

  // Filter and normalize languages
  const languages: ProfileLanguage[] = (raw.languages || [])
    .map(normalizeLanguageItem)
    .filter((lang) => Boolean(lang.language));

  return {
    url: profileUrl,
    name: name || null,
    headline: headline || null,
    location: location || null,
    about: about || null,
    image: image || null,
    experience,
    education,
    skills,
    certifications,
    languages,
  };
}
