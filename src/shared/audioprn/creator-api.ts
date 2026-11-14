// audioprn: client for the verified-creator API (/api/v4/audioprn/*).
// These endpoints aren't in lemmy-js-client, so they're called with fetch directly.
import { myAuth } from "@utils/app";
import { getBackendHostExternal } from "@utils/env";

export const CONTENT_LINKS_REQUIRED = 3;
// Social links are add-as-many-as-needed; the backend caps them at 20 to stop abuse.
export const MAX_SOCIAL_LINKS = 20;

export interface CreatorApplication {
  id: number;
  person_id: number;
  content_links: string[];
  social_links: string[];
  /** null = pending, true = approved, false = denied */
  approved: boolean | null;
  admin_id: number | null;
  deny_reason: string | null;
  published_at: string;
  updated_at: string | null;
}

export interface CreatorApplicationView {
  creator_application: CreatorApplication;
  person_name: string;
  person_display_name: string | null;
  email_verified: boolean;
}

/** Readable messages for the backend's creator error codes. */
const ERROR_MESSAGES: Record<string, string> = {
  creator_three_content_links_required:
    "Please add exactly 3 links to your audios or scripts.",
  creator_content_links_must_be_different:
    "Your 3 content links must all be different.",
  creator_too_many_social_links: "You can add at most 20 social media links.",
  only_verified_creators_can_post: "Only verified creators can post.",
  invalid_url: "One of the links isn't a valid web address.",
  invalid_url_scheme: "Links must start with https:// or http://",
  already_exists: "You already have a creator application.",
  log_in_to_read_scripts: "Log in to read the script.",
  script_read_limit:
    "You've read a lot of scripts in the last hour. Please try again a little later.",
  scripts_only_on_script_offer_posts:
    "Scripts can only be added to posts with the Script Offer flair.",
  invalid_script: "The script is too long (200,000 characters at most).",
  too_many_feed_tags: "Use at most 10 favourite tags.",
  invalid_feed_tag: "Tags can be up to 40 characters, without [ ] inside.",
  invalid_creator_footer:
    "The footer can have up to 500 characters and 10 links.",
  invalid_news_flash: "News flashes can be up to 300 characters.",
  invalid_taboo_tags: "Taboo tags can be up to 40 characters each.",
  invalid_poll: "A poll needs a question, 2-6 options and a future end date.",
  already_voted: "You've already voted in this poll.",
  poll_ended: "This poll has ended.",
  title_needs_gender_tag:
    "Start the title with a gender tag like [F4M], [M4F] or [F4A].",
  too_many_title_tags:
    "Use at most 7 [tags] in the title, not counting gender tags.",
  post_needs_one_flair:
    "Choose one flair for your post (e.g. Audio: OC or Script Offer).",
  no_awards_left:
    "You have no awards left. You get one each week you post or comment.",
  cant_award_post: "You can't award your own post, or one you already awarded.",
  invalid_draft: "This draft is too long to save.",
  already_imported: "Already imported.",
  import_limit: "You can import up to 500 posts a day. Try the rest tomorrow.",
  invalid_reddit_import: "This post's Reddit id or date isn't valid.",
  too_many_drafts: "You have 50 drafts. Delete some to save new ones.",
  invalid_creator_pin:
    "The pinned post can have up to 20 social links and 5,000 characters per section.",
};

export function creatorErrorMessage(code?: string): string {
  return (
    (code && ERROR_MESSAGES[code]) || "Something went wrong. Please try again."
  );
}

export class CreatorApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const auth = myAuth();
  const res = await fetch(
    `${getBackendHostExternal()}/api/v4/audioprn${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Errors look like {"error":"unknown","message":"<code>"} or {"error":"<code>"}.
    const code = json.error === "unknown" ? json.message : json.error;
    throw new CreatorApiError(creatorErrorMessage(code), res.status);
  }
  return json as T;
}

export function submitCreatorApplication(
  content_links: string[],
  social_links: string[],
) {
  return call<{ creator_application: CreatorApplication }>(
    "POST",
    "/creator_application",
    { content_links, social_links },
  );
}

export function getMyCreatorApplication() {
  return call<{ creator_application: CreatorApplication | null }>(
    "GET",
    "/creator_application/mine",
  );
}

export function listCreatorApplications(pendingOnly: boolean) {
  return call<{ creator_applications: CreatorApplicationView[] }>(
    "GET",
    `/creator_application/list?pending_only=${pendingOnly}`,
  );
}

export function approveCreatorApplication(
  id: number,
  approve: boolean,
  deny_reason?: string,
) {
  return call<{ creator_application: CreatorApplication }>(
    "PUT",
    "/creator_application/approve",
    { id, approve, deny_reason },
  );
}

/** Error codes the register endpoint returns for bad creator links. */
export function registerErrorMessage(err: {
  name: string;
  message?: string;
}): string | undefined {
  const code = err.name === "unknown" ? err.message : err.name;
  return code && code in ERROR_MESSAGES ? ERROR_MESSAGES[code] : undefined;
}
