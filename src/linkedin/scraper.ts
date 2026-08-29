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
  timeoutMs: number = 35000
): Promise<LinkedInProfile> {
  console.log(`[Scraper] Starting scrape for URL: ${profileUrl}`);

  return await browserManager.withPage(async (page: Page) => {
    try {
      // Navigate to the profile page
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
          "LinkedIn authentication wall encountered. Please provide a valid, active LINKEDIN_STORAGE_STATE session.",
          401,
          "AUTH_REQUIRED"
        );
      }

      // Check for 404 or profile not found
      if (response.status() === 404) {
        throw new ScrapeError("LinkedIn profile not found", 404, "PROFILE_NOT_FOUND");
      }

      // Wait a moment for dynamic hydration
      await page.waitForTimeout(2000);

      // Check for "Profile not found" page content
      const isNotFound = await page.evaluate(() => {
        const text = document.body ? document.body.innerText || "" : "";
        return (
          text.includes("This profile is not available") ||
          text.includes("Page not found") ||
          text.includes("An exact match was not found") ||
          text.includes("This page does not exist")
        );
      });

      if (isNotFound) {
        throw new ScrapeError("LinkedIn profile not found or unavailable", 404, "PROFILE_NOT_FOUND");
      }

      // Scroll page down smoothly to trigger lazy-loaded sections (Experience, Education, Skills, etc.)
      await page.evaluate(async () => {
        const scrollStep = 500;
        const totalHeight = Math.min(document.body.scrollHeight, 5000);
        for (let current = 0; current < totalHeight; current += scrollStep) {
          window.scrollTo(0, current);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        window.scrollTo(0, 0);
      });

      // Small wait after scrolling for content rendering
      await page.waitForTimeout(1500);

      // Optional: expand "...see more" buttons if present
      await page.evaluate(() => {
        const seeMoreButtons = document.querySelectorAll(
          'button.inline-show-more-text__button, button[aria-label*="see more"], button.artdeco-button--tertiary'
        );
        seeMoreButtons.forEach((btn) => {
          try {
            (btn as HTMLButtonElement).click();
          } catch {
            // ignore click errors
          }
        });
      });

      // Extract raw data from the page DOM and JSON-LD
      const rawData = await page.evaluate((): RawProfileData => {
        // Ensure __name helper exists in page evaluate scope
        if (typeof (window as any).__name === "undefined") {
          (window as any).__name = (target: any) => target;
        }

        // Helper to get clean text content
        const getText = (el: Element | null | undefined): string | null => {
          if (!el) return null;
          const ariaHidden = el.querySelector('span[aria-hidden="true"]');
          if (ariaHidden && ariaHidden.textContent && ariaHidden.textContent.trim()) {
            return ariaHidden.textContent.trim();
          }
          return el.textContent && el.textContent.trim() ? el.textContent.trim() : null;
        };

        // Extract JSON-LD if available
        let jsonLd: Record<string, any> | null = null;
        try {
          const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (let i = 0; i < ldScripts.length; i++) {
            const s = ldScripts[i];
            const parsed = JSON.parse(s.textContent || "{}");
            if (parsed["@type"] === "Person" || parsed["@type"] === "Profile") {
              jsonLd = parsed;
              break;
            }
          }
        } catch {
          // ignore jsonld parse errors
        }

        // Top Card Extraction
        let name: string | null = null;
        let headline: string | null = null;
        let location: string | null = null;
        let image: string | null = null;

        // Top card sections
        const sections = Array.from(document.querySelectorAll("main section, section")) as HTMLElement[];

        // Name extraction
        const nameEl =
          document.querySelector("h1.text-heading-xlarge") ||
          document.querySelector("h1.top-card-layout__title") ||
          document.querySelector(".pv-top-card--list h1") ||
          document.querySelector("main section h1") ||
          document.querySelector("main section h2");
        name = getText(nameEl);

        // Filter out notification headings if mistakenly matched
        if (name && (name.includes("notifications") || name.includes("Explore"))) {
          name = null;
        }

        // Headline extraction
        const headlineEl =
          document.querySelector(".text-body-medium.break-words") ||
          document.querySelector("div[data-generated-suggestion-target]") ||
          document.querySelector(".top-card-layout__headline") ||
          document.querySelector("main section .text-body-medium");
        headline = getText(headlineEl);

        // Location from standard selectors
        const locationEl =
          document.querySelector(".text-body-small.inline.t-black--light.break-words") ||
          document.querySelector("span.top-card__subline-item") ||
          document.querySelector(".pv-top-card--list-bullet .text-body-small");
        location = getText(locationEl);

        // Fallback for Name, Headline, and Location from top card container text
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
            if (l && !l.includes("notifications") && !l.includes("Premium")) {
              lines.push(l);
            }
          }

          if (!name && lines.length > 0) name = lines[0];
          if (!headline && lines.length > 1 && !lines[1].includes("Contact info")) headline = lines[1];

          if (!location && lines.length > 2) {
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
                l !== headline
              ) {
                location = l;
                break;
              }
            }
          }
        }

        // Avatar Image
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

        // Helper to find section by keyword
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

        // Experience Extraction
        const experience: Array<{
          title?: string | null;
          company?: string | null;
          employmentType?: string | null;
          duration?: string | null;
          startDate?: string | null;
          endDate?: string | null;
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
            const nestedRoles = li.querySelectorAll("ul.pvs-list > li");
            if (nestedRoles.length > 0) {
              const companyNameEl = li.querySelector(
                'div[data-view-name="profile-component-entity"] span[aria-hidden="true"]'
              );
              const companyName = getText(companyNameEl);

              for (let j = 0; j < nestedRoles.length; j++) {
                const roleLi = nestedRoles[j];
                const spans: string[] = [];
                const spanEls = roleLi.querySelectorAll('span[aria-hidden="true"]');
                for (let k = 0; k < spanEls.length; k++) {
                  const t = spanEls[k].textContent?.trim();
                  if (t) spans.push(t);
                }

                const descEl = roleLi.querySelector(".inline-show-more-text");
                const description = getText(descEl);

                experience.push({
                  company: companyName,
                  title: spans[0] || null,
                  duration: spans[1] || null,
                  location: spans[2] || null,
                  description: description || (spans.length > 3 ? spans.slice(3).join("\n") : null),
                  rawTextLines: spans,
                });
              }
            } else {
              const spans: string[] = [];
              const spanEls = li.querySelectorAll('span[aria-hidden="true"]');
              for (let k = 0; k < spanEls.length; k++) {
                const t = spanEls[k].textContent?.trim();
                if (t) spans.push(t);
              }

              const descEl = li.querySelector(".inline-show-more-text");
              const description = getText(descEl);

              experience.push({
                title: spans[0] || null,
                company: spans[1] || null,
                duration: spans[2] || null,
                location: spans[3] || null,
                description: description || (spans.length > 4 ? spans.slice(4).join("\n") : null),
                rawTextLines: spans,
              });
            }
          }
        }

        // Education Extraction
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
            const spans: string[] = [];
            const spanEls = li.querySelectorAll('span[aria-hidden="true"]');
            for (let k = 0; k < spanEls.length; k++) {
              const t = spanEls[k].textContent?.trim();
              if (t) spans.push(t);
            }

            const descEl = li.querySelector(".inline-show-more-text");
            const description = getText(descEl);

            education.push({
              school: spans[0] || null,
              degree: spans[1] || null,
              duration: spans[2] || null,
              description: description || (spans.length > 3 ? spans.slice(3).join("\n") : null),
              rawTextLines: spans,
            });
          }
        }

        // Skills Extraction
        const skills: string[] = [];
        const skillsSection = findSectionByHeading("skills");
        if (skillsSection) {
          const listItems = skillsSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );

          for (let i = 0; i < listItems.length; i++) {
            const li = listItems[i];
            const spanEl = li.querySelector('span[aria-hidden="true"]');
            const t = spanEl?.textContent?.trim();
            if (t) {
              skills.push(t);
            }
          }
        }

        // Certifications Extraction
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
            const spans: string[] = [];
            const spanEls = li.querySelectorAll('span[aria-hidden="true"]');
            for (let k = 0; k < spanEls.length; k++) {
              const t = spanEls[k].textContent?.trim();
              if (t) spans.push(t);
            }

            const linkEl = li.querySelector("a[href*='credential'], a.optional-action-target") as HTMLAnchorElement | null;
            const credentialUrl = linkEl?.href || null;

            certifications.push({
              name: spans[0] || null,
              issuer: spans[1] || null,
              issueDate: spans[2] || null,
              credentialId: spans[3] || null,
              credentialUrl,
              rawTextLines: spans,
            });
          }
        }

        // Languages Extraction
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
            const spans: string[] = [];
            const spanEls = li.querySelectorAll('span[aria-hidden="true"]');
            for (let k = 0; k < spanEls.length; k++) {
              const t = spanEls[k].textContent?.trim();
              if (t) spans.push(t);
            }

            languages.push({
              language: spans[0] || null,
              proficiency: spans[1] || null,
              rawTextLines: spans,
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
          jsonLd,
        };
      });

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
