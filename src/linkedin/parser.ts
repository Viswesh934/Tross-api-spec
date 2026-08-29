import type {
  LinkedInProfile,
  ProfileCertification,
  ProfileEducation,
  ProfileExperience,
  ProfileLanguage,
} from "../schemas/profile.js";

/**
 * Format Voyager date object { year, month } into human-readable string
 */
export function formatVoyagerDate(dateObj: any): string | null {
  if (!dateObj || typeof dateObj !== "object") return null;
  const year = dateObj.year;
  const month = dateObj.month;
  if (!year) return null;

  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (typeof month === "number" && month >= 1 && month <= 12) {
    return `${months[month]} ${year}`;
  }
  return String(year);
}

/**
 * Parse raw LinkedIn Voyager API response into structured LinkedInProfile
 */
export function parseVoyagerResponse(data: any, profileUrl: string): LinkedInProfile {
  const included: any[] = Array.isArray(data?.included) ? data.included : [];

  // 1. Profile entity
  const profileEntity =
    included.find(
      (e) =>
        typeof e?.$type === "string" &&
        e.$type.includes("identity.profile.Profile") &&
        (e.firstName || e.headline)
    ) || {};

  const firstName = (profileEntity.firstName || "").trim();
  const lastName = (profileEntity.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim() || null;
  const headline = (profileEntity.headline || "").trim() || null;
  const about = (profileEntity.summary || "").trim() || null;
  const location =
    (profileEntity.geoLocationName || profileEntity.locationName || "").trim() || null;

  // Extract avatar image URL from vectorImage artifacts
  let image: string | null = null;
  const picture = profileEntity.profilePicture || profileEntity.picture || {};
  const vectorImg =
    picture.displayImageReference?.vectorImage || picture.vectorImage || null;

  if (vectorImg && vectorImg.rootUrl && Array.isArray(vectorImg.artifacts)) {
    const artifacts = vectorImg.artifacts;
    if (artifacts.length > 0) {
      const largest = artifacts.reduce(
        (prev: any, curr: any) => ((curr.width || 0) > (prev.width || 0) ? curr : prev),
        artifacts[0]
      );
      if (largest?.fileIdentifyingUrlPathSegment) {
        image = `${vectorImg.rootUrl}${largest.fileIdentifyingUrlPathSegment}`;
      }
    }
  }

  // 2. Experience / Positions
  const experience: ProfileExperience[] = [];
  const positions = included.filter(
    (e) => typeof e?.$type === "string" && e.$type.includes("identity.profile.Position")
  );

  for (const p of positions) {
    const title = (p.title || "").trim() || null;
    const company = (p.companyName || "").trim() || null;
    const employmentType = (p.employmentType || "").trim() || null;
    const loc = (p.locationName || "").trim() || null;
    const description = (p.description || "").trim() || null;

    const dr = p.dateRange || {};
    const startDate = formatVoyagerDate(dr.start);
    const endDate = dr.end ? formatVoyagerDate(dr.end) : startDate ? "Present" : null;

    let duration: string | null = null;
    if (startDate && endDate) {
      duration = `${startDate} - ${endDate}`;
    }

    if (title || company) {
      experience.push({
        title,
        company,
        employmentType,
        duration,
        startDate,
        endDate,
        location: loc,
        description,
      });
    }
  }

  // 3. Education
  const education: ProfileEducation[] = [];
  const educations = included.filter(
    (e) => typeof e?.$type === "string" && e.$type.includes("identity.profile.Education")
  );

  for (const edu of educations) {
    const school = (edu.schoolName || "").trim() || null;
    const degree = (edu.degreeName || "").trim() || null;
    const fieldOfStudy = (edu.fieldOfStudy || "").trim() || null;
    const description = (edu.description || "").trim() || null;

    const dr = edu.dateRange || {};
    const startDate = formatVoyagerDate(dr.start);
    const endDate = formatVoyagerDate(dr.end);

    let duration: string | null = null;
    if (startDate && endDate) {
      duration = `${startDate} - ${endDate}`;
    }

    if (school || degree) {
      education.push({
        school,
        degree,
        fieldOfStudy,
        duration,
        startDate,
        endDate,
        description,
      });
    }
  }

  // 4. Skills
  const skills: string[] = [];
  const skillEntities = included.filter(
    (e) => typeof e?.$type === "string" && e.$type.includes("identity.profile.Skill")
  );

  for (const s of skillEntities) {
    const sName = (s.name || "").trim();
    if (sName && !skills.includes(sName)) {
      skills.push(sName);
    }
  }

  // 5. Certifications
  const certifications: ProfileCertification[] = [];
  const certs = included.filter(
    (e) => typeof e?.$type === "string" && e.$type.includes("identity.profile.Certification")
  );

  for (const c of certs) {
    const name = (c.name || "").trim() || null;
    const issuer = (c.authority || c.companyName || "").trim() || null;
    const dr = c.timePeriod || {};
    const issueDate = formatVoyagerDate(dr.start);
    const expirationDate = formatVoyagerDate(dr.end);
    const credentialId = (c.licenseNumber || "").trim() || null;
    const credentialUrl = (c.url || "").trim() || null;

    if (name || issuer) {
      certifications.push({
        name,
        issuer,
        issueDate,
        expirationDate,
        credentialId,
        credentialUrl,
      });
    }
  }

  // 6. Languages
  const languages: ProfileLanguage[] = [];
  const langs = included.filter(
    (e) => typeof e?.$type === "string" && e.$type.includes("identity.profile.Language")
  );

  for (const l of langs) {
    const langName = (l.name || "").trim() || null;
    const proficiency = (l.proficiency || "").trim() || null;
    if (langName) {
      languages.push({
        language: langName,
        proficiency,
      });
    }
  }

  return {
    url: profileUrl,
    name: fullName,
    headline,
    location,
    about,
    image,
    experience,
    education,
    skills,
    certifications,
    languages,
  };
}
