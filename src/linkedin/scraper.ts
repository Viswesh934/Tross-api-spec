import type { Page } from "playwright";
import { browserManager } from "./browser.js";
import { normalizeProfile, type RawProfileData } from "./parser.js";
import type { LinkedInProfile } from "../schemas/profile.js";

export class ScrapeError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "SCRAPE_ERROR"
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

/**
 * Scrapes a LinkedIn profile URL using Playwright
 */
export async function scrapeLinkedInProfile(
  profileUrl: string,
  timeoutMs: number = 40000
): Promise<LinkedInProfile> {
  console.log(`[Scraper] Starting scrape for URL: ${profileUrl}`);

  return await browserManager.withPage(async (page: Page) => {
    try {
      // Step 1: Navigate to the main profile page
      const response = await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });

      if (!response) {
        throw new ScrapeError("Failed to receive response from LinkedIn", 502, "NO_RESPONSE");
      }

      const currentUrl = page.url();

      // Check if redirected to login, authwall, or checkpoint
      if (
        currentUrl.includes("/login") ||
        currentUrl.includes("/authwall") ||
        currentUrl.includes("/checkpoint") ||
        currentUrl.includes("uas/login")
      ) {
        throw new ScrapeError(
          "LinkedIn authentication wall or security checkpoint encountered. Please provide a fresh, active session cookie.",
          401,
          "AUTH_REQUIRED"
        );
      }

      // Check for 404 or profile not found
      if (response.status() === 404 || currentUrl.includes("/404")) {
        throw new ScrapeError("LinkedIn profile not found", 404, "PROFILE_NOT_FOUND");
      }

      await page.waitForTimeout(1500);

      // Check page text for security verification or profile not found
      const pageStatus = await page.evaluate(() => {
        const text = document.body ? document.body.innerText || "" : "";
        const isCheckpoint =
          text.includes("Security verification") ||
          text.includes("Join LinkedIn") ||
          text.includes("Sign in to view full profile") ||
          text.includes("Sign in to LinkedIn") ||
          document.title.includes("Sign In") ||
          document.title.includes("Sign Up") ||
          document.title.includes("Security Verification");

        const isNotFound =
          text.includes("This profile is not available") ||
          text.includes("Page not found") ||
          text.includes("An exact match was not found") ||
          text.includes("This page does not exist");

        return { isCheckpoint, isNotFound };
      });

      if (pageStatus.isCheckpoint) {
        throw new ScrapeError(
          "LinkedIn security verification or authwall encountered. Please refresh your session in session.json / LINKEDIN_STORAGE_STATE.",
          401,
          "AUTH_REQUIRED"
        );
      }

      if (pageStatus.isNotFound) {
        throw new ScrapeError("LinkedIn profile not found or unavailable", 404, "PROFILE_NOT_FOUND");
      }

      // Smooth scroll on main page to trigger dynamic section loading
      await page.evaluate(async () => {
        const scrollStep = 600;
        const totalHeight = Math.min(document.body.scrollHeight, 4500);
        for (let current = 0; current < totalHeight; current += scrollStep) {
          window.scrollTo(0, current);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        window.scrollTo(0, 0);
      });

      await page.waitForTimeout(1000);

      // Extract raw data from main profile page
      const rawData = await page.evaluate((): RawProfileData => {
        if (typeof (window as any).__name === "undefined") {
          (window as any).__name = (target: any) => target;
        }

        const getText = (el: Element | null | undefined): string | null => {
          if (!el) return null;
          const ariaHidden = el.querySelector('span[aria-hidden="true"]');
          if (ariaHidden && ariaHidden.textContent && ariaHidden.textContent.trim()) {
            return ariaHidden.textContent.trim();
          }
          return el.textContent && el.textContent.trim() ? el.textContent.trim() : null;
        };

        let name: string | null = null;
        let headline: string | null = null;
        let location: string | null = null;
        let image: string | null = null;

        const sections = Array.from(document.querySelectorAll("main section, section")) as HTMLElement[];

        // Top Card Extraction
        let topSection: HTMLElement | null = null;
        for (let i = 0; i < sections.length; i++) {
          const s = sections[i];
          const text = s.innerText || "";
          if (
            text.includes("followers") ||
            text.includes("connections") ||
            text.includes("Contact info") ||
            s.querySelector("img.pv-top-card-profile-picture__image") !== null
          ) {
            topSection = s;
            break;
          }
        }

        if (topSection) {
          const rawLines = (topSection.innerText || "").split("\n");
          const lines: string[] = [];
          for (let i = 0; i < rawLines.length; i++) {
            const l = rawLines[i].trim();
            const isBadge = /^·?\s*(1st|2nd|3rd)\+?$/i.test(l);
            if (l && !isBadge && !l.includes("notifications") && !l.includes("Premium") && !l.includes("follower")) {
              lines.push(l);
            }
          }

          if (lines.length > 0) name = lines[0];
          if (lines.length > 1 && !lines[1].toLowerCase().includes("contact info")) headline = lines[1];

          if (lines.length > 2) {
            for (let i = 2; i < lines.length; i++) {
              const l = lines[i];
              const lLower = l.toLowerCase();
              if (
                !lLower.includes("contact info") &&
                !lLower.includes("followers") &&
                !lLower.includes("connections") &&
                !lLower.includes("following") &&
                !lLower.includes("connect") &&
                !lLower.includes("message") &&
                !lLower.includes("view my") &&
                l !== headline
              ) {
                location = l;
                break;
              }
            }
          }
        }

        // Top Card Selectors Fallback
        if (!name) {
          const nameEl = document.querySelector(
            "h1.text-heading-xlarge, h1.top-card-layout__title, main section h1, main section h2"
          );
          name = getText(nameEl);
        }
        if (!headline) {
          const headlineEl = document.querySelector(".text-body-medium.break-words, main section .text-body-medium");
          headline = getText(headlineEl);
        }
        if (!location) {
          const locationEl = document.querySelector(
            ".text-body-small.inline.t-black--light.break-words, span.top-card__subline-item"
          );
          location = getText(locationEl);
        }

        // Avatar
        const imgEl = document.querySelector(
          "img.pv-top-card-profile-picture__image, img.presence-entity__image, img.pv-top-card__photo, main img[alt*='Photo'], main img[alt*='photo'], img[src*='licdn.com/dms/image']"
        ) as HTMLImageElement | null;
        if (imgEl && imgEl.src && !imgEl.src.startsWith("data:image/gif")) {
          image = imgEl.src;
        }

        // About section
        let about: string | null = null;
        let aboutSection: HTMLElement | null =
          (document.querySelector("div#about")?.closest("section") as HTMLElement) ||
          (document.querySelector("section.pv-about-section") as HTMLElement);

        if (!aboutSection) {
          for (let i = 0; i < sections.length; i++) {
            const s = sections[i];
            const heading = s.querySelector("h2, h3");
            if (heading && heading.textContent && heading.textContent.toLowerCase().trim() === "about") {
              aboutSection = s;
              break;
            }
          }
        }

        if (aboutSection) {
          const aboutContentEl =
            aboutSection.querySelector(".inline-show-more-text") ||
            aboutSection.querySelector(".pv-shared-text-with-see-more") ||
            aboutSection.querySelector(".display-flex.ph5.pv3");
          about = getText(aboutContentEl);

          if (!about) {
            const rawAboutLines = (aboutSection.innerText || "").split("\n");
            const cleanAboutLines: string[] = [];
            for (let i = 0; i < rawAboutLines.length; i++) {
              const l = rawAboutLines[i].trim();
              if (l && l.toLowerCase() !== "about") {
                cleanAboutLines.push(l);
              }
            }
            if (cleanAboutLines.length > 0) about = cleanAboutLines.join("\n");
          }
        }

        // Helper to find main page sections
        const findSectionByHeading = (keyword: string): HTMLElement | null => {
          const idMatch = document.getElementById(keyword.toLowerCase().replace(/[^a-z0-9]/g, "_"));
          if (idMatch) return idMatch.closest("section") as HTMLElement;

          for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            const heading = sec.querySelector("h2, h3");
            if (heading && heading.textContent && heading.textContent.toLowerCase().includes(keyword.toLowerCase())) {
              return sec as HTMLElement;
            }
          }
          return null;
        };

        // Main page experience items
        const experience: Array<{
          title?: string | null;
          company?: string | null;
          employmentType?: string | null;
          duration?: string | null;
          location?: string | null;
          description?: string | null;
          rawTextLines?: string[];
        }> = [];

        const expSection = findSectionByHeading("experience");
        if (expSection) {
          const listItems = expSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );

          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const rawLines = (li as HTMLElement).innerText.split("\n").map((l) => l.trim()).filter(Boolean);
            const spans: string[] = [];
            const spanEls = li.querySelectorAll('span[aria-hidden="true"]');
            for (let k = 0; k < spanEls.length; k++) {
              const t = spanEls[k].textContent?.trim();
              if (t) spans.push(t);
            }

            experience.push({
              rawTextLines: rawLines.length > 0 ? rawLines : spans,
              title: spans[0] || rawLines[0] || null,
              company: spans[1] || rawLines[1] || null,
              duration: spans[2] || rawLines[2] || null,
              description: rawLines.length > 3 ? rawLines.slice(3).join("\n") : null,
            });
          }
        }

        // Main page education items
        const education: Array<{
          school?: string | null;
          degree?: string | null;
          fieldOfStudy?: string | null;
          duration?: string | null;
          description?: string | null;
          rawTextLines?: string[];
        }> = [];

        const eduSection = findSectionByHeading("education");
        if (eduSection) {
          const listItems = eduSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );

          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const rawLines = (li as HTMLElement).innerText.split("\n").map((l) => l.trim()).filter(Boolean);
            const spans: string[] = [];
            const spanEls = li.querySelectorAll('span[aria-hidden="true"]');
            for (let k = 0; k < spanEls.length; k++) {
              const t = spanEls[k].textContent?.trim();
              if (t) spans.push(t);
            }

            education.push({
              rawTextLines: rawLines.length > 0 ? rawLines : spans,
              school: spans[0] || rawLines[0] || null,
              degree: spans[1] || rawLines[1] || null,
              duration: spans[2] || rawLines[2] || null,
              description: rawLines.length > 3 ? rawLines.slice(3).join("\n") : null,
            });
          }
        }

        // Main page skills
        const skills: string[] = [];
        const skillsSection = findSectionByHeading("skills");
        if (skillsSection) {
          const listItems = skillsSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );
          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const spanEl = li.querySelector('span[aria-hidden="true"]');
            const t = spanEl?.textContent?.trim() || (li as HTMLElement).innerText?.trim();
            if (t) skills.push(t);
          }
        }

        // Main page certifications
        const certifications: Array<{
          name?: string | null;
          issuer?: string | null;
          issueDate?: string | null;
          credentialId?: string | null;
          credentialUrl?: string | null;
          rawTextLines?: string[];
        }> = [];

        const certSection =
          findSectionByHeading("licenses_and_certifications") ||
          findSectionByHeading("certifications") ||
          findSectionByHeading("licenses");

        if (certSection) {
          const listItems = certSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );

          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const rawLines = (li as HTMLElement).innerText.split("\n").map((l) => l.trim()).filter(Boolean);
            certifications.push({
              rawTextLines: rawLines,
              name: rawLines[0] || null,
              issuer: rawLines[1] || null,
              issueDate: rawLines[2] || null,
            });
          }
        }

        // Main page languages
        const languages: Array<{
          language?: string | null;
          proficiency?: string | null;
          rawTextLines?: string[];
        }> = [];

        const langSection = findSectionByHeading("languages");
        if (langSection) {
          const listItems = langSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );
          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const rawLines = (li as HTMLElement).innerText.split("\n").map((l) => l.trim()).filter(Boolean);
            languages.push({
              rawTextLines: rawLines,
              language: rawLines[0] || null,
              proficiency: rawLines[1] || null,
            });
          }
        }

        return {
          url: window.location.href,
          name,
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
      });

      // Step 2: Sub-Route Enrichment for empty sections
      const cleanBase = profileUrl.replace(/\/$/, "");
      const sectionsToCheck: Array<{
        section: "experience" | "education" | "skills" | "certifications" | "languages";
        subPath: string;
      }> = [
        { section: "experience", subPath: "details/experience/" },
        { section: "education", subPath: "details/education/" },
        { section: "skills", subPath: "details/skills/" },
        { section: "certifications", subPath: "details/certifications/" },
        { section: "languages", subPath: "details/languages/" },
      ];

      for (const item of sectionsToCheck) {
        const currentList = rawData[item.section];
        if (!currentList || currentList.length === 0) {
          const detailUrl = `${cleanBase}/${item.subPath}`;
          try {
            const resp = await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 6000 });
            if (
              resp &&
              resp.status() === 200 &&
              !page.url().includes("/404") &&
              !page.url().includes("/login") &&
              !page.url().includes("/authwall") &&
              !page.url().includes("/checkpoint")
            ) {
              await page.waitForTimeout(800);

              const subItems = await page.evaluate(() => {
                const lis = Array.from(
                  document.querySelectorAll(
                    "main ul > li, ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
                  )
                );
                return lis
                  .map((li) => {
                    const rawLines = (li as HTMLElement).innerText
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean);
                    const spans = Array.from(li.querySelectorAll('span[aria-hidden="true"]'))
                      .map((s) => s.textContent?.trim())
                      .filter(Boolean);

                    return {
                      rawTextLines: rawLines.length > 0 ? rawLines : spans,
                      title: spans[0] || rawLines[0] || null,
                      company: spans[1] || rawLines[1] || null,
                      duration: spans[2] || rawLines[2] || null,
                      description: rawLines.length > 3 ? rawLines.slice(3).join("\n") : null,
                    };
                  })
                  .filter((x) => x.rawTextLines.length > 0);
              });

              if (subItems.length > 0) {
                if (item.section === "skills") {
                  rawData.skills = subItems.map((it: any) => it.rawTextLines[0]).filter(Boolean);
                } else {
                  (rawData as any)[item.section] = subItems;
                }
              }
            }
          } catch {
            // Ignore sub-route navigation errors (continue gracefully)
          }
        }
      }

      console.log(`[Scraper] Successfully extracted raw profile data for: ${profileUrl}`);
      return normalizeProfile(rawData, profileUrl);
    } catch (err: any) {
      if (err instanceof ScrapeError) {
        throw err;
      }
      if (err.name === "TimeoutError") {
        throw new ScrapeError("Timeout while loading or scraping LinkedIn profile", 504, "TIMEOUT");
      }
      throw new ScrapeError(`Scraping failed: ${err.message}`, 500, "SCRAPE_FAILED");
    }
  }, timeoutMs);
}
