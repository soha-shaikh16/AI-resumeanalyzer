// aiService.js — Google Gemini AI integration for Resume Analysis

const axios = require("axios");
const { truncateText } = require("./utils");

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

async function analyzeResume(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing. Add it to your .env file.");

  const safeText = truncateText(text, 4000);

  // Compact prompt — asks for minimal JSON to stay within token limits
  const prompt = `You are an expert resume reviewer. Analyze the resume below and return ONLY a raw JSON object. No markdown, no backticks, no explanation. Start with { and end with }.

Return this exact JSON structure (keep all string values SHORT — under 120 chars each):

{"overallScore":45,"overallVerdict":"Short verdict here","candidateName":"Name","targetRole":"Role","sections":{"contactInfo":{"score":70,"status":"average","found":true,"feedback":"Short feedback","missing":["item1"],"improvements":["tip1"]},"summary":{"score":0,"status":"missing","found":false,"feedback":"Short feedback","improvements":["tip1","tip2"]},"experience":{"score":35,"status":"weak","found":true,"feedback":"Short feedback","yearsEstimated":"2-3 years","improvements":["tip1","tip2"]},"education":{"score":55,"status":"average","found":true,"feedback":"Short feedback","improvements":["tip1"]},"skills":{"score":40,"status":"weak","found":true,"feedback":"Short feedback","technicalSkills":["skill1","skill2"],"softSkills":["skill1"],"improvements":["tip1","tip2"]},"achievements":{"score":0,"status":"missing","found":false,"feedback":"Short feedback","improvements":["tip1"]},"formatting":{"score":50,"status":"average","feedback":"Short feedback","improvements":["tip1"]}},"strengths":["strength1","strength2","strength3"],"weaknesses":["weakness1","weakness2","weakness3"],"topImprovements":[{"priority":"high","action":"action1","impact":"impact1"},{"priority":"high","action":"action2","impact":"impact2"},{"priority":"medium","action":"action3","impact":"impact3"},{"priority":"medium","action":"action4","impact":"impact4"},{"priority":"low","action":"action5","impact":"impact5"}],"atsScore":38,"atsFeedback":"Short ATS feedback","keywords":{"present":["kw1","kw2"],"missing":["kw1","kw2"]},"industryFit":"Short industry fit assessment"}

Resume to analyze:
${safeText}`;

  try {
    const response = await axios.post(
      `${GEMINI_URL}?key=${apiKey}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 60000 }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("✅ Gemini responded. Raw length:", rawText.length);
    console.log("📝 First 100 chars:", rawText.slice(0, 100));

    const parsed = parseGeminiResponse(rawText);

    // If parse failed or score is 0 with no sections, use fallback enriched with what we know
    if (!parsed || parsed._fallback) {
      console.log("⚠️  Using enriched fallback response");
      return buildFallback(safeText, parsed);
    }

    return parsed;

  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.error?.message || error.message;
    if (status === 403) throw new Error("Gemini error: API key invalid. Visit aistudio.google.com.");
    if (status === 429) {
      console.log("⏳ Rate limit, retrying in 12s...");
      await new Promise(r => setTimeout(r, 12000));
      return analyzeResume(text);
    }
    console.log("❌ Gemini call failed:", msg, "— using fallback");
    return buildFallback(text, null);
  }
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseGeminiResponse(rawText) {
  const attempts = [
    // 1. direct
    () => JSON.parse(rawText.trim()),
    // 2. strip fences
    () => JSON.parse(rawText.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim()),
    // 3. slice first { to last }
    () => {
      const s = rawText.indexOf("{"), e = rawText.lastIndexOf("}");
      if (s === -1 || e === -1 || e <= s) throw new Error("no braces");
      return JSON.parse(rawText.slice(s, e + 1));
    },
    // 4. slice + fix trailing commas
    () => {
      const s = rawText.indexOf("{"), e = rawText.lastIndexOf("}");
      if (s === -1 || e === -1 || e <= s) throw new Error("no braces");
      return JSON.parse(rawText.slice(s, e + 1).replace(/,\s*([\]}])/g, "$1"));
    },
    // 5. try to recover truncated JSON by closing open structures
    () => {
      const s = rawText.indexOf("{");
      if (s === -1) throw new Error("no open brace");
      let str = rawText.slice(s);
      // Count unclosed braces and brackets
      let braces = 0, brackets = 0, inStr = false, escape = false;
      for (const ch of str) {
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') braces++;
        if (ch === '}') braces--;
        if (ch === '[') brackets++;
        if (ch === ']') brackets--;
      }
      // Close unclosed brackets/braces
      str = str.trimEnd();
      // Remove trailing comma if any
      str = str.replace(/,\s*$/, "");
      for (let i = 0; i < brackets; i++) str += "]";
      for (let i = 0; i < braces; i++) str += "}";
      return JSON.parse(str);
    },
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      const parsed = attempts[i]();
      if (parsed && typeof parsed === "object") {
        console.log(`✅ Parsed with strategy ${i + 1}`);
        return parsed;
      }
    } catch (_) {}
  }

  console.error("❌ All parse strategies failed.");
  return { _fallback: true };
}

// ── Fallback builder ──────────────────────────────────────────────────────────
// Returns a useful result even when Gemini fails — uses heuristics on the raw text
function buildFallback(text, partialParsed) {
  const t = text.toLowerCase();

  // Try to salvage any fields from a partial parse
  const p = (partialParsed && !partialParsed._fallback) ? partialParsed : {};

  // Heuristic scoring
  const hasSummary     = /summary|objective|profile|about/i.test(t);
  const hasExperience  = /experience|worked|developer|engineer|manager|intern/i.test(t);
  const hasEducation   = /education|university|college|degree|bachelor|master/i.test(t);
  const hasSkills      = /skills|python|javascript|react|java|sql|html/i.test(t);
  const hasAchievements= /award|certif|achievement|published|led|built|launched|increased/i.test(t);
  const hasContact     = /email|phone|linkedin|@/i.test(t);
  const hasMetrics     = /\d+%|\$\d+|\d+ (users|clients|projects|teams|people)/i.test(t);

  const contactScore     = hasContact     ? 65 : 30;
  const summaryScore     = hasSummary     ? 55 : 0;
  const experienceScore  = hasExperience  ? (hasMetrics ? 65 : 35) : 10;
  const educationScore   = hasEducation   ? 60 : 20;
  const skillsScore      = hasSkills      ? 50 : 20;
  const achievementScore = hasAchievements? 55 : 0;
  const formattingScore  = 50;

  const overall = p.overallScore || Math.round(
    (contactScore + summaryScore + experienceScore + educationScore + skillsScore + achievementScore + formattingScore) / 7
  );

  // Extract candidate name heuristic (first line that looks like a name)
  let candidateName = p.candidateName || "Candidate";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(line) && line.length < 40) {
      candidateName = line;
      break;
    }
  }

  const grade = overall >= 70 ? "solid" : overall >= 50 ? "average" : "needs significant work";

  return {
    overallScore: overall,
    overallVerdict: p.overallVerdict || `This resume ${grade} and has several areas that can be improved to stand out to recruiters.`,
    candidateName,
    targetRole: p.targetRole || (hasExperience ? "Software / Technical Role" : "Professional Role"),

    sections: p.sections || {
      contactInfo: {
        score: contactScore,
        status: contactScore >= 70 ? "strong" : contactScore >= 50 ? "average" : "weak",
        found: hasContact,
        feedback: hasContact
          ? "Basic contact info is present. Consider adding LinkedIn, GitHub, or a portfolio link."
          : "Contact information appears to be missing or hard to find.",
        missing: ["LinkedIn profile", "GitHub profile", "Portfolio URL"],
        improvements: [
          "Add your LinkedIn URL in the header",
          "Include GitHub link if you have public projects",
          "Add your city and state (not full address)",
        ],
      },
      summary: {
        score: summaryScore,
        status: hasSummary ? "average" : "missing",
        found: hasSummary,
        feedback: hasSummary
          ? "A summary is present but could be stronger and more targeted."
          : "No professional summary found. This is a critical missing section.",
        improvements: [
          "Add a 2-3 sentence professional summary at the top",
          "Mention your years of experience, key skills, and career goal",
          "Tailor the summary to the specific job you are applying for",
        ],
      },
      experience: {
        score: experienceScore,
        status: experienceScore >= 65 ? "strong" : experienceScore >= 40 ? "average" : "weak",
        found: hasExperience,
        feedback: hasExperience
          ? hasMetrics
            ? "Work experience is present with some metrics. Continue adding quantified achievements."
            : "Work experience is listed but bullet points are vague. Add numbers and measurable impact."
          : "No clear work experience section found.",
        yearsEstimated: "Unknown",
        improvements: [
          "Start every bullet point with a strong action verb (Built, Led, Increased, Reduced)",
          "Add numbers: how many users, what % improvement, how much revenue",
          "Remove weak phrases like 'helped with' or 'worked on' — be specific",
          "List 4-6 bullet points per role",
        ],
      },
      education: {
        score: educationScore,
        status: educationScore >= 65 ? "strong" : educationScore >= 45 ? "average" : "weak",
        found: hasEducation,
        feedback: hasEducation
          ? "Education section is present but could include more detail."
          : "Education section appears to be missing.",
        improvements: [
          "Add GPA if it is 3.5 or above",
          "List 3-4 relevant courses",
          "Include any academic projects, thesis, or honours",
          "Add graduation year if not present",
        ],
      },
      skills: {
        score: skillsScore,
        status: skillsScore >= 65 ? "strong" : skillsScore >= 45 ? "average" : "weak",
        found: hasSkills,
        feedback: hasSkills
          ? "Skills are listed but the section could be more comprehensive and organised."
          : "No dedicated skills section found.",
        technicalSkills: [],
        softSkills: [],
        improvements: [
          "Organise skills into categories: Languages, Frameworks, Tools, Cloud",
          "Add modern frameworks relevant to your target role",
          "Include cloud platforms (AWS, Azure, GCP) if applicable",
          "Remove overly basic skills like Microsoft Word",
        ],
      },
      achievements: {
        score: achievementScore,
        status: hasAchievements ? "average" : "missing",
        found: hasAchievements,
        feedback: hasAchievements
          ? "Some achievements are present. Make sure they are prominently highlighted."
          : "No certifications, awards, or notable achievements found.",
        improvements: [
          "Add any professional certifications (AWS, Google, Microsoft)",
          "Include notable projects with links if possible",
          "List any hackathon wins, publications, or open source contributions",
          "Even online course completions (Coursera, Udemy) add value",
        ],
      },
      formatting: {
        score: formattingScore,
        status: "average",
        feedback: "Formatting appears functional but there may be room for improvement in layout and ATS compatibility.",
        improvements: [
          "Use a clean single-column layout for maximum ATS compatibility",
          "Keep resume to 1 page if under 5 years experience",
          "Use consistent font sizes: 11-12pt body, 14-16pt name",
          "Avoid tables, text boxes, and graphics as ATS cannot read them",
          "Use standard section headings: Experience, Education, Skills",
        ],
      },
    },

    strengths: p.strengths || [
      hasExperience  ? "Has relevant work experience in the field" : "Educational background provides a foundation",
      hasSkills      ? "Technical skills are listed showing technical awareness" : "Resume demonstrates career intent",
      hasContact     ? "Contact information makes it easy for recruiters to reach out" : "Resume has a clear structure",
    ],

    weaknesses: p.weaknesses || [
      !hasSummary     ? "Missing professional summary — recruiters spend 6 seconds on a resume" : "Summary could be more targeted and impactful",
      !hasMetrics     ? "No quantified achievements — numbers make your impact concrete and memorable" : "Some bullets still lack measurable outcomes",
      !hasAchievements? "No certifications or notable achievements to differentiate from other candidates" : "Achievements section could be expanded",
      skillsScore < 55? "Skills section lacks modern tools and frameworks expected in job descriptions" : "Skills section could be better organised",
    ].filter(Boolean).slice(0, 4),

    topImprovements: p.topImprovements || [
      { priority: "high",   action: "Add a professional summary at the top of your resume",         impact: "Recruiters read summaries first — a strong one keeps them reading" },
      { priority: "high",   action: "Rewrite all bullet points to include numbers and percentages",  impact: "Quantified bullets are 40% more likely to result in an interview callback" },
      { priority: "high",   action: "Expand skills section with in-demand frameworks and tools",     impact: "ATS systems filter by keywords — missing skills means automatic rejection" },
      { priority: "medium", action: "Add at least one professional certification",                   impact: "Certifications validate skills and show commitment to growth" },
      { priority: "low",    action: "Remove hobbies section and replace with a projects section",    impact: "Projects demonstrate practical ability far better than personal interests" },
    ],

    atsScore: p.atsScore || Math.round(overall * 0.85),
    atsFeedback: p.atsFeedback || "ATS compatibility is limited. Add more industry keywords, use standard section headings, and avoid special characters or tables.",

    keywords: p.keywords || {
      present: ["Experience", "Education", hasSkills ? "Technical Skills" : null].filter(Boolean),
      missing: ["Professional Summary", "Quantified Achievements", "Modern Frameworks", "Cloud Platforms", "Certifications"],
    },

    industryFit: p.industryFit || "Resume shows foundational experience but needs stronger alignment with industry expectations through better keywords, quantified impact, and modern skill sets.",
  };
}

module.exports = { analyzeResume };