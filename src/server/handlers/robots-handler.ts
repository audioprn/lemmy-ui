import type { Response } from "express";

// audioprn: AI training and AI search crawlers.
const AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "cohere-ai",
  "Diffbot",
  "omgili",
  "Timpibot",
  "ImagesiftBot",
];

export default ({ res }: { res: Response }) => {
  res.type("text/plain; charset=utf-8");

  // audioprn: keep AI crawlers out (creators' scripts and posts aren't training data).
  res.send(`${AI_CRAWLERS.map(bot => `User-Agent: ${bot}`).join("\n")}
Disallow: /

User-Agent: *
Disallow: /login
Disallow: /login_reset
Disallow: /signup
Disallow: /settings
Disallow: /create_community
Disallow: /create_post
Disallow: /create_private_message
Disallow: /notifications
Disallow: /setup
Disallow: /admin
Disallow: /password_change
Disallow: /search
Disallow: /modlog
Disallow: /api
Crawl-delay: 60`);
};
