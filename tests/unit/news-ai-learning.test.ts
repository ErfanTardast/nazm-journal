import { describe, expect, it } from "vitest";
import { getAiProvider } from "@/lib/services/ai";
import { learningTemplates } from "@/lib/services/learning";
import { analyzeNews, getNewsProvider } from "@/lib/services/news";

describe("second-brain local providers", () => {
  it("returns bilingual local news fallback", async () => {
    const news = await getNewsProvider().list("fa");
    expect(news[0].language).toBe("fa");
    expect(news[0].market).toBe("forex");
    expect(news[0].title).toContain("بانک مرکزی");
  });

  it("analyzes text news without requiring external providers", async () => {
    const analysis = await analyzeNews("demo-user", {
      text: "Central bank rate comments may affect EURUSD volatility.",
      language: "en",
      mode: "professional_coach"
    });
    expect(analysis.affectedMarket).toBe("forex");
    expect(analysis.disclaimer).toContain("does not predict");
  });

  it("generates local AI learning trade review", async () => {
    const review = await getAiProvider().reviewTrade("demo-user", {
      symbol: "BTCUSDT",
      side: "long",
      entryPrice: 100,
      exitPrice: 110,
      stopLoss: 95,
      takeProfit: 120,
      mode: "learning"
    });
    expect(review.mode).toBe("learning");
    expect(review.disclaimer).toContain("not personalized financial advice");
  });

  it("calls a plan پلن in the Persian news, news checklist and learning templates", async () => {
    const news = await getNewsProvider().list("fa");
    const analysis = await analyzeNews("demo-user", { text: "Central bank rate comments may affect EURUSD volatility.", language: "fa", mode: "professional_coach" });
    const text = [
      ...news.map((item) => item.summary),
      ...analysis.reviewChecklist,
      ...learningTemplates("fa").weeklyReview,
      ...learningTemplates("fa").journalPrompt
    ].join("\n");

    expect(text).not.toMatch(/برنامه(?!‌ریزی)/);
    expect(news[0].summary).toBe("پیش از نوشتن پلن برای جفت‌ارزهای اصلی، زمان رویداد و میزان ریسک را بررسی کنید.");
    expect(analysis.reviewChecklist[2]).toBe("اگر پلن شما با خبر تضاد دارد، معامله را بازبینی کنید");
    expect(learningTemplates("fa").weeklyReview[1]).toBe("بهترین پایبندی به پلن در هفته");
  });

  it("names the source of the built-in news items a sample, not a developer's 'local context'", async () => {
    const fa = await getNewsProvider().list("fa");
    const en = await getNewsProvider().list("en");

    expect(fa.map((item) => item.source)).toEqual(["نمونه آموزشی اپ نظم"]);
    expect(en.map((item) => item.source)).toEqual(["Nazm sample", "Nazm sample"]);
  });

  it("returns localized learning templates", () => {
    expect(learningTemplates("fa").journalPrompt[0]).toContain("معامله");
  });
});
