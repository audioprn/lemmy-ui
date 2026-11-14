// audioprn: import posts from a Reddit data export (posts.csv). The file is read here, in the
// browser: only the posts the creator picks are sent, never the rest of the export (such as IP
// addresses). Only titles starting with a gender tag are offered (others aren't content).
// [Script Fill], [Private Script Fill] and [Script Offer] leave the title (the flair says it) and
// tags past the 7th move to the top of the text, so titles meet the Content page rule. Credits
// come only from "script by" / "written by" (writer) and "edited by" / "edit by" (editor) followed
// by a username. Posts keep their Reddit date and say where they were first posted.
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, WithHead } from "@utils/app";
import { HttpService } from "@services/index";
import { Component } from "inferno";
import { RouteComponentProps, RouterContext } from "inferno-router";
import { CommunityView } from "lemmy-js-client";
import { call } from "./creator-api";
import { CreatorOnly } from "./creator-status";
import { shortLink } from "./news-feed";

const GENDER = /^\[((TF|TM|NB|F|M|A)+4)+(TF|TM|NB|F|M|A)+\]$/i;
const TAG = /\[[^[\]]{1,40}\]/g;
const DROPPED = /^\[(private )?script (fill|offer)\]$/i;
const AUDIO_HOSTS = ["soundgasm.net", "hotaudio.net", "whyp.it", "erocast.me"];
const FLAIRS: Record<string, string> = {
  script_fill: "Audio: Script Fill",
  script_offer: "Script Offer",
  oc: "Audio: OC",
  podcast_ama: "Podcast/AMA",
  collection: "Collection",
};
const PAGE = 50;

interface Row {
  id: string;
  date: string;
  subreddit: string;
  permalink: string;
  title: string;
  /** Tags moved out of the title, to the top of the text. */
  moved: string[];
  body: string;
  url?: string;
  flair: string;
  writers: string;
  editors: string;
  selected: boolean;
  /** "imported", or why it failed. */
  status?: string;
}

/** RFC 4180 CSV (quoted fields can hold commas, quotes and new lines). */
function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const NAME =
  /\s*:?\s*\**\s*(?:\[[^\]]*\]\(https?:\/\/(?:www\.|old\.)?reddit\.com\/u(?:ser)?\/([\w-]+)\/?\)|\/?u\/([\w\\-]+))/y;
const SEPARATOR = /\s*(?:,|&|\band\b)/y;

/** Usernames right after a phrase like "script by", e.g. "script by u/anna and u/bo". */
function namesAfter(body: string, phrase: RegExp): string {
  const names = new Set<string>();
  for (const m of body.matchAll(phrase)) {
    let i = (m.index ?? 0) + m[0].length;
    for (;;) {
      NAME.lastIndex = i;
      const n = NAME.exec(body);
      if (!n) break;
      names.add((n[1] ?? n[2]).replace(/\\/g, ""));
      SEPARATOR.lastIndex = i = NAME.lastIndex;
      if (!SEPARATOR.exec(body)) break;
      i = SEPARATOR.lastIndex;
    }
  }
  return [...names].join(", ");
}

/** The first audio link in the text (scriptbin for script offers). */
function firstLink(body: string, flair: string): string | undefined {
  const hosts = flair === "script_offer" ? ["scriptbin.works"] : AUDIO_HOSTS;
  return [...body.matchAll(/https?:\/\/[^\s)\]]+/g)]
    .map(m => m[0].replace(/\\/g, "").replace(/[.,*]+$/, ""))
    .find(link => {
      try {
        return hosts.includes(new URL(link).hostname.replace(/^www\./, ""));
      } catch {
        return false;
      }
    });
}

/** A post from the export, ready to review; none if its title doesn't start with a gender tag. */
function toRow(get: (column: string) => string): Row | undefined {
  const original = get("title").trim();
  const tags = original.match(TAG) ?? [];
  if (!tags[0] || !original.startsWith(tags[0]) || !GENDER.test(tags[0])) {
    return undefined;
  }
  const flair = /\[script offer\]/i.test(original)
    ? "script_offer"
    : /script fill\]/i.test(original)
      ? "script_fill"
      : /\[(podcast|ama)\b/i.test(original)
        ? "podcast_ama"
        : "oc";
  let title = original;
  let kept = 0;
  const moved: string[] = [];
  for (const tag of tags) {
    if (DROPPED.test(tag)) {
      title = title.replace(tag, "");
    } else if (!GENDER.test(tag) && ++kept > 7) {
      moved.push(tag);
      title = title.replace(tag, "");
    }
  }
  const raw = get("body");
  const body = /^\[(deleted|removed)\]$/.test(raw) ? "" : raw;
  return {
    id: get("id"),
    date: get("date").replace(" UTC", "Z").replace(" ", "T"),
    subreddit: get("subreddit"),
    permalink: get("permalink"),
    title: title.replace(/\s{2,}/g, " ").trim(),
    moved,
    body,
    url: firstLink(body, flair),
    flair,
    // The word may be bold or a link: "**Script** by", "[Script ](link)by".
    writers: namesAfter(
      body,
      /\b(?:script|written)\s*\**(?:\]\([^)]*\))?\**\s*by\b/gi,
    ),
    editors: namesAfter(
      body,
      /\bedit(?:ed)?\s*\**(?:\]\([^)]*\))?\**\s*by\b/gi,
    ),
    selected: false,
  };
}

const where = (subreddit: string) =>
  subreddit.startsWith("u_") ? `u/${subreddit.slice(2)}` : `r/${subreddit}`;

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { dateStyle: "long" });

/** The post text: moved tags first, then the Reddit text, then where it was first posted. */
const importBody = (row: Row) =>
  [
    row.moved.join(" "),
    row.body,
    `*Originally posted on [${where(row.subreddit)}](${row.permalink}) on ${formatDate(row.date)}.*`,
  ]
    .filter(Boolean)
    .join("\n\n");

const toCredits = (role: string, names: string) =>
  names
    .split(",")
    .map(name => name.trim())
    .filter(Boolean)
    .map(name => ({ role, name }));

interface State {
  rows: Row[];
  skipped: number;
  subreddit: string;
  shown: number;
  creatorPage: boolean;
  communities: Partial<Record<"main" | "creators", CommunityView>>;
  importing?: { done: number; total: number };
}

type Props = RouteComponentProps<Record<string, never>> & WithHead;

export class RedditImport extends Component<Props, State> {
  private isoData = setIsoData(this.context);
  state: State = {
    rows: [],
    skipped: 0,
    subreddit: "",
    shown: PAGE,
    creatorPage: false,
    communities: {},
  };

  async componentDidMount() {
    for (const name of ["main", "creators"] as const) {
      const res = await HttpService.client.getCommunity({ name });
      if (res.state === "success") {
        this.setState(s => ({
          communities: { ...s.communities, [name]: res.data.community_view },
        }));
      }
    }
  }

  async readFile(file?: File) {
    if (!file) return;
    const [header, ...lines] = parseCsv(await file.text());
    const col = (name: string) => header.indexOf(name);
    if (col("id") < 0 || col("title") < 0 || col("body") < 0) {
      alert("This doesn't look like posts.csv from a Reddit data export.");
      return;
    }
    // Only the columns used here are read; the rest of the export (like ip) is never kept.
    const all = lines
      .filter(line => line.length === header.length)
      .map(line => toRow(name => line[col(name)] ?? ""));
    const rows = all.filter((r): r is Row => !!r);
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const { reddit_ids } = await call<{ reddit_ids: string[] }>(
      "GET",
      "/reddit_imports",
    ).catch(() => ({ reddit_ids: [] as string[] }));
    for (const row of rows) {
      if (reddit_ids.includes(row.id)) row.status = "imported";
    }
    this.setState({ rows, skipped: all.length - rows.length, shown: PAGE });
  }

  get visible(): Row[] {
    const { rows, subreddit } = this.state;
    return subreddit ? rows.filter(r => r.subreddit === subreddit) : rows;
  }

  update(row: Row, change: Partial<Row>) {
    this.setState(s => ({
      rows: s.rows.map(r => (r === row ? { ...r, ...change } : r)),
    }));
  }

  selectVisible(selected: boolean) {
    const visible = new Set(this.visible);
    this.setState(s => ({
      rows: s.rows.map(r =>
        visible.has(r) && r.status !== "imported" ? { ...r, selected } : r,
      ),
    }));
  }

  async importSelected() {
    const community =
      this.state.communities[this.state.creatorPage ? "creators" : "main"];
    if (!community) return;
    const todo = this.state.rows.filter(r => r.selected);
    this.setState({ importing: { done: 0, total: todo.length } });
    for (const [i, row] of todo.entries()) {
      // The rows may have been re-created by edits; work on the current one.
      const current = this.state.rows.find(r => r.id === row.id) ?? row;
      const flair = community.tags.find(
        t => t.name === current.flair && !t.deleted,
      );
      let status: string;
      try {
        await call("POST", "/reddit_import", {
          reddit_id: current.id,
          date: current.date,
          credits: [
            ...toCredits("writer", current.writers),
            ...toCredits("editor", current.editors),
          ],
          post: {
            name: current.title,
            community_id: community.community.id,
            url: current.url,
            body: importBody(current),
            tags: flair ? [flair.id] : undefined,
          },
        });
        status = "imported";
      } catch (e) {
        status = (e as Error).message;
      }
      this.setState(s => ({
        rows: s.rows.map(r =>
          r.id === current.id
            ? { ...r, status, selected: status !== "imported" }
            : r,
        ),
        importing: { done: i + 1, total: todo.length },
      }));
    }
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Import from Reddit - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    const { rows, skipped, subreddit, shown, creatorPage, importing } =
      this.state;
    const visible = this.visible;
    const subreddits = [...new Set(rows.map(r => r.subreddit))];
    const selected = rows.filter(r => r.selected).length;
    const busy = !!importing && importing.done < importing.total;
    return (
      <div className="container-lg">
        <h1 className="h3 mb-3">Import your posts from Reddit</h1>
        <CreatorOnly>
          <p>
            Request your data at{" "}
            <a href="https://www.reddit.com/settings/data-request">
              reddit.com/settings/data-request
            </a>
            . Reddit emails you a zip: open it and choose{" "}
            <strong>posts.csv</strong> below. The file is read on your device;
            only the posts you import are sent, nothing else from it.
          </p>
          <p className="small text-muted">
            Only posts whose title starts with a gender tag are listed. [Script
            Fill], [Private Script Fill] and [Script Offer] are taken out of
            titles (the flair shows it), and tags after the 7th move to the top
            of the post text. Writers and editors are taken from &ldquo;script
            by&rdquo;, &ldquo;written by&rdquo;, &ldquo;edited by&rdquo; or
            &ldquo;edit by&rdquo; followed by a username: check them before
            importing. Posts keep their Reddit date and link back to Reddit.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="form-control mb-3"
            aria-label="posts.csv"
            onChange={e => this.readFile(e.target.files?.[0])}
          />
          {rows.length > 0 && (
            <>
              <p>
                {rows.length} posts found
                {skipped > 0 && ` (${skipped} without a gender tag left out)`}.
              </p>
              <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
                <select
                  className="form-select w-auto"
                  aria-label="Subreddit"
                  value={subreddit}
                  onChange={e =>
                    this.setState({ subreddit: e.target.value, shown: PAGE })
                  }
                >
                  <option value="">All subreddits</option>
                  {subreddits.map(s => (
                    <option value={s}>
                      {where(s)} ({rows.filter(r => r.subreddit === s).length})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle"
                  onClick={() => this.selectVisible(true)}
                >
                  Select all shown
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle"
                  onClick={() => this.selectVisible(false)}
                >
                  Select none
                </button>
                <div className="form-check mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="import-creator-page"
                    checked={creatorPage}
                    onChange={e =>
                      this.setState({ creatorPage: e.target.checked })
                    }
                  />
                  <label
                    className="form-check-label"
                    htmlFor="import-creator-page"
                  >
                    Import to my creator page instead of the Content page
                  </label>
                </div>
              </div>
              <ul className="list-group mb-2">
                {visible.slice(0, shown).map(row => (
                  <li className="list-group-item">
                    <div className="d-flex gap-2 align-items-start">
                      <input
                        className="form-check-input mt-2"
                        type="checkbox"
                        aria-label="Import this post"
                        checked={row.selected}
                        disabled={row.status === "imported"}
                        onChange={e =>
                          this.update(row, { selected: e.target.checked })
                        }
                      />
                      <div className="flex-grow-1">
                        <input
                          className="form-control form-control-sm mb-1"
                          aria-label="Title"
                          value={row.title}
                          onInput={e =>
                            this.update(row, { title: e.target.value })
                          }
                        />
                        <div className="small text-muted mb-1">
                          {formatDate(row.date)} · {where(row.subreddit)}
                          {row.url && ` · ${shortLink(row.url)}`}
                          {row.moved.length > 0 &&
                            ` · ${row.moved.length} tags moved to the text`}
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                          <select
                            className="form-select form-select-sm w-auto"
                            aria-label="Flair"
                            value={row.flair}
                            onChange={e =>
                              this.update(row, { flair: e.target.value })
                            }
                          >
                            {Object.entries(FLAIRS).map(([name, label]) => (
                              <option value={name}>{label}</option>
                            ))}
                          </select>
                          <input
                            className="form-control form-control-sm w-auto"
                            placeholder="✍️ Writers"
                            aria-label="Writers"
                            value={row.writers}
                            onInput={e =>
                              this.update(row, { writers: e.target.value })
                            }
                          />
                          <input
                            className="form-control form-control-sm w-auto"
                            placeholder="🎬 Editors"
                            aria-label="Editors"
                            value={row.editors}
                            onInput={e =>
                              this.update(row, { editors: e.target.value })
                            }
                          />
                        </div>
                        {row.status && (
                          <div
                            className={`small mt-1 ${row.status === "imported" ? "text-success" : "text-danger"}`}
                          >
                            {row.status === "imported"
                              ? "✓ Imported"
                              : row.status}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {visible.length > shown && (
                <button
                  type="button"
                  className="btn btn-link mb-3"
                  onClick={() => this.setState({ shown: shown + PAGE })}
                >
                  Show more ({visible.length - shown} left)
                </button>
              )}
              <div className="d-flex align-items-center gap-3 mb-5">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selected || busy}
                  onClick={() => this.importSelected()}
                >
                  Import {selected} selected posts
                </button>
                {importing && (
                  <span>
                    {busy
                      ? `Importing ${importing.done + 1} of ${importing.total}…`
                      : `Done: ${importing.total} handled.`}
                  </span>
                )}
              </div>
            </>
          )}
        </CreatorOnly>
      </div>
    );
  }
}
