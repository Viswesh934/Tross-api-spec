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
        const text = document.body.innerText || "";
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
        // Helper to get clean text content
        const getText = (el: Element | null | undefined): string | null => {
          if (!el) return null;
          const ariaHidden = el.querySelector('span[aria-hidden="true"]');
          if (ariaHidden && ariaHidden.textContent?.trim()) {
            return ariaHidden.textContent.trim();
          }
          return el.textContent?.trim() || null;
        };

        // Extract JSON-LD if available
        let jsonLd: Record<string, any> | null = null;
        try {
          const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const s of Array.from(ldScripts)) {
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
        const topSection = sections.find((s) => {
          const text = s.innerText || "";
          return (
            text.includes("followers") ||
            text.includes("connections") ||
            text.includes("Contact info") ||
            s.querySelector("img.pv-top-card-profile-picture__image") !== null
          );
        });

        if (topSection) {
          const lines: string[] = (topSection.innerText || "")
            .split("\n")
            .map((l: string) => l.trim())
            .filter((l: string) => Boolean(l) && !l.includes("notifications") && !l.includes("Premium"));

          if (!name && lines.length > 0) name = lines[0];
          if (!headline && lines.length > 1 && !lines[1].includes("Contact info")) headline = lines[1];

          if (!location && lines.length > 2) {
            const subsequentLines = lines.slice(2);
            const locCandidate = subsequentLines.find(
              (l: string) =>
                !l.toLowerCase().includes("contact info") &&
                !l.toLowerCase().includes("followers") &&
                !l.toLowerCase().includes("connections") &&
                !l.toLowerCase().includes("following") &&
                !l.toLowerCase().includes("connect") &&
                !l.toLowerCase().includes("message") &&
                l !== headline
            );
            if (locCandidate) location = locCandidate;
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
        const aboutSection =
          document.querySelector("div#about")?.closest("section") ||
          document.querySelector("section.pv-about-section") ||
          sections.find((s) => {
            const heading = s.querySelector("h2, h3");
            return heading && heading.textContent?.toLowerCase().trim() === "about";
          });

        if (aboutSection) {
          const aboutContentEl =
            aboutSection.querySelector(".inline-show-more-text") ||
            aboutSection.querySelector(".pv-shared-text-with-see-more") ||
            aboutSection.querySelector(".display-flex.ph5.pv3");
          about = getText(aboutContentEl);

          if (!about) {
            const textLines: string[] = ((aboutSection as HTMLElement).innerText || "")
              .split("\n")
              .map((l: string) => l.trim())
              .filter((l: string) => Boolean(l) && l.toLowerCase() !== "about");
            if (textLines.length > 0) about = textLines.join("\n");
          }
        }

        // Helper to find section by keyword
        const findSectionByHeading = (keyword: string): HTMLElement | null => {
          const idMatch = document.getElementById(keyword.toLowerCase().replace(/[^a-z0-9]/g, "_"));
          if (idMatch) return idMatch.closest("section") as HTMLElement;

          for (const sec of sections) {
            const heading = sec.querySelector("h2, h3");
            if (heading && heading.textContent?.toLowerCase().includes(keyword.toLowerCase())) {
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

          listItems.forEach((li) => {
            const nestedRoles = li.querySelectorAll("ul.pvs-list > li");
            if (nestedRoles.length > 0) {
              const companyNameEl = li.querySelector(
                'div[data-view-name="profile-component-entity"] span[aria-hidden="true"]'
              );
              const companyName = getText(companyNameEl);

              nestedRoles.forEach((roleLi) => {
                const spans = Array.from(roleLi.querySelectorAll('span[aria-hidden="true"]'))
                  .map((s) => s.textContent?.trim())
                  .filter((s): s is string => Boolean(s));

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
              });
            } else {
              const spans = Array.from(li.querySelectorAll('span[aria-hidden="true"]'))
                .map((s) => s.textContent?.trim())
                .filter((s): s is string => Boolean(s));

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
          });
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

          listItems.forEach((li) => {
            const spans = Array.from(li.querySelectorAll('span[aria-hidden="true"]'))
              .map((s) => s.textContent?.trim())
              .filter((s): s is string => Boolean(s));

            const descEl = li.querySelector(".inline-show-more-text");
            const description = getText(descEl);

            education.push({
              school: spans[0] || null,
              degree: spans[1] || null,
              duration: spans[2] || null,
              description: description || (spans.length > 3 ? spans.slice(3).join("\n") : null),
              rawTextLines: spans,
            });
          });
        }

        // Skills Extraction
        const skills: string[] = [];
        const skillsSection = findSectionByHeading("skills");
        if (skillsSection) {
          const listItems = skillsSection.querySelectorAll(
            "ul.pvs-list > li, li.pvs-list__item--line-separated, li.artdeco-list__item"
          );

          listItems.forEach((li) => {
            const spans = Array.from(li.querySelectorAll('span[aria-hidden="true"]'))
              .map((s) => s.textContent?.trim())
              .filter((s): s is string => Boolean(s));

            if (spans.length > 0 && spans[0]) {
              skills.push(spans[0]);
            }
          });
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

          listItems.forEach((li) => {
            const spans = Array.from(li.querySelectorAll('span[aria-hidden="true"]'))
              .map((s) => s.textContent?.trim())
              .filter((s): s is string => Boolean(s));

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
          });
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

          listItems.forEach((li) => {
            const spans = Array.from(li.querySelectorAll('span[aria-hidden="true"]'))
              .map((s) => s.textContent?.trim())
              .filter((s): s is string => Boolean(s));

            languages.push({
              language: spans[0] || null,
              proficiency: spans[1] || null,
              rawTextLines: spans,
            });
          });
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
