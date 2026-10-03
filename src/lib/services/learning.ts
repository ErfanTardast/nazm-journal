import { isDatabaseUnavailableError } from "@/lib/db/errors";
import { prisma } from "@/lib/db/prisma";
import type { Locale } from "@/lib/i18n/locales";

export async function listGlossary(locale: Locale = "en") {
  try {
    const stored = await prisma.learningGlossary.findMany({
      where: { language: locale },
      orderBy: { term: "asc" }
    });
    if (stored.length > 0) return stored;
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      throw error;
    }
  }

  return locale === "fa"
    ? [
        {
          term: "امید ریاضی",
          language: "fa",
          level: "beginner",
          definition: "میانگین نتیجه مورد انتظار هر معامله بر اساس نرخ برد، میانگین سود و میانگین زیان.",
          example: "امید ریاضی مثبت یعنی فرآیند بررسی‌شده در نمونه اندازه‌گیری‌شده بهتر عمل کرده است.",
          relatedTerms: ["نرخ برد", "ضریب R"]
        }
      ]
    : [
        {
          term: "Expectancy",
          language: "en",
          level: "beginner",
          definition: "The average expected result per trade using win rate, average win, and average loss.",
          example: "Positive expectancy means the reviewed process has performed better over the measured sample.",
          relatedTerms: ["Win rate", "R multiple"]
        }
      ];
}

export function learningTemplates(locale: Locale = "en") {
  return locale === "fa"
    ? {
        journalPrompt: ["آیا معامله طبق چک‌لیست بود؟", "کدام احساس روی تصمیم اثر گذاشت؟", "درس اصلی این معامله چه بود؟"],
        weeklyReview: ["سه اشتباه تکراری هفته", "بهترین پایبندی به پلن در هفته", "تمرکز هفته بعد"]
      }
    : {
        journalPrompt: ["Did the trade follow the checklist?", "Which emotion influenced the decision?", "What is the main lesson?"],
        weeklyReview: ["Top three repeated mistakes", "Best plan adherence of the week", "Next week focus"]
      };
}
