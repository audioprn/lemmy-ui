// audioprn: search on the Content page, in gwasi's syntax (see search_sql in the backend and the
// Search Guide). Above the posts: the search box with Expanded search (a form that writes the
// search, with popular tag chips) and the user's saved search, and the Compact / Cards switch.
import { setIsoData, toast } from "@utils/app";
import { isBrowser } from "@utils/browser";
import { Component, createRef } from "inferno";
import { Link } from "inferno-router";
import { PostView } from "lemmy-js-client";
import { call } from "./creator-api";
import { lengthMinutes } from "./masterlist";

const VIEW_KEY = "audioprn_search_view";

/** Compact (one line per post) or cards, remembered in this browser. */
export function savedCompact(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) === "compact";
  } catch {
    return false;
  }
}

function saveCompact(compact: boolean) {
  try {
    localStorage.setItem(VIEW_KEY, compact ? "compact" : "cards");
  } catch {
    // Not remembered, that's all.
  }
}

const SEARCH_ERRORS: Record<string, string> = {
  search_too_long: "That search is too long.",
  search_bad_type: "type: can be audio, script or other (or t:a, t:s, t:o).",
  search_bad_date:
    "date: takes 14d (h, d, m or y), 2024, 2024-11, or 2024-2-10_2024-2-15.",
  search_bad_number: "Numbers are written 5, <5, >=5, 5+ or 3-10.",
};

/** A search problem from the backend, in words; undefined for other errors. */
export const searchError = (message?: string) =>
  message ? SEARCH_ERRORS[message] : undefined;

interface Tag {
  tag: string;
  count: number;
}

let popularTags: Promise<Tag[]> | undefined;

const GENDER = /^(TF|TM|NB|F|M|A)+(4(TF|TM|NB|F|M|A)+)+$/;

/** Tags are stored in capitals: show "Creampie", "L-Bombs", but "F4M". */
const tagLabel = (tag: string) =>
  GENDER.test(tag)
    ? tag
    : tag.toLowerCase().replace(/(^|[\s\-/])\p{L}/gu, c => c.toUpperCase());

const count = (n: number) =>
  n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${n}`;

/** A value for name:value, quoted when it has spaces. */
const value = (v: string) => (/\s/.test(v.trim()) ? `"${v.trim()}"` : v.trim());

/** min/max boxes as 3-10, >=3 or <=10. */
function range(min: string, max: string): string | undefined {
  const [a, b] = [min.trim(), max.trim()];
  if (a && b) return `${a}-${b}`;
  if (a) return `>=${a}`;
  if (b) return `<=${b}`;
  return undefined;
}

type Form = Record<
  | "all"
  | "phrase"
  | "any"
  | "none"
  | "tags"
  | "notTags"
  | "creator"
  | "writer"
  | "flair"
  | "type"
  | "fillsMin"
  | "fillsMax"
  | "userfillsMin"
  | "lengthMin"
  | "lengthMax"
  | "date"
  | "reactions"
  | "comments",
  string
>;

const EMPTY_FORM: Form = {
  all: "",
  phrase: "",
  any: "",
  none: "",
  tags: "",
  notTags: "",
  creator: "",
  writer: "",
  flair: "",
  type: "",
  fillsMin: "",
  fillsMax: "",
  userfillsMin: "",
  lengthMin: "",
  lengthMax: "",
  date: "",
  reactions: "",
  comments: "",
};

/** The Expanded search form as a search. */
function formQuery(f: Form): string {
  const words = (s: string) => s.split(/\s+/).filter(Boolean);
  const tags = (s: string) =>
    s
      .split(",")
      .map(t => t.trim().replace(/^\[|\]$/g, ""))
      .filter(Boolean);
  const any = words(f.any);
  const fills = range(f.fillsMin, f.fillsMax);
  const length = range(f.lengthMin, f.lengthMax);
  return [
    f.all.trim(),
    f.phrase.trim() && `"${f.phrase.trim().replace(/"/g, "")}"`,
    any.length > 1 ? `(${any.join(" OR ")})` : any[0],
    ...words(f.none).map(w => `-${w}`),
    ...tags(f.tags).map(t => `[${t}]`),
    ...tags(f.notTags).map(t => `-[${t}]`),
    f.creator.trim() && `u:${value(f.creator)}`,
    f.writer.trim() && `w:${value(f.writer)}`,
    f.flair.trim() && `f:${value(f.flair)}`,
    f.type && `t:${f.type}`,
    fills && `fills:${fills}`,
    f.userfillsMin.trim() && `userfills:>=${f.userfillsMin.trim()}`,
    length && `length:${length}`,
    f.date && `date:${f.date}`,
    f.reactions.trim() && `reactions:>=${f.reactions.trim()}`,
    f.comments.trim() && `comments:>=${f.comments.trim()}`,
  ]
    .filter(Boolean)
    .join(" ");
}

interface Props {
  q?: string;
  /** A search problem from the backend, already in words. */
  error?: string;
  compact: boolean;
  /** Search results include the dark cummunity's tags ([Extreme], slurs). */
  extreme: boolean;
  onExtreme: (on: boolean) => void;
  onSearch: (q: string | undefined) => void;
  onCompact: (compact: boolean) => void;
  /** The saved search changed: load the posts again. */
  onSavedChange: () => void;
}

interface State {
  text: string;
  expanded: boolean;
  form: Form;
  tags: Tag[];
  saved?: { saved_query: string; use_saved: boolean };
  savedText: string;
}

export class SearchPanel extends Component<Props, State> {
  private isoData = setIsoData(this.context);
  private inputRef = createRef<HTMLInputElement>();
  state: State = {
    text: this.props.q ?? "",
    expanded: false,
    form: EMPTY_FORM,
    tags: [],
    savedText: "",
  };

  async componentDidMount() {
    this.openFromLink();
    popularTags ??= call<{ tags: Tag[] }>("GET", "/popular_tags")
      .then(r => r.tags)
      .catch(() => []);
    this.setState({ tags: await popularTags });
    if (this.isoData.myUserInfo) {
      const saved = await call<State["saved"]>("GET", "/search_prefs").catch(
        () => undefined,
      );
      this.setState({ saved, savedText: saved?.saved_query ?? "" });
    }
  }

  componentWillReceiveProps(next: Props) {
    if (next.q !== this.props.q) this.setState({ text: next.q ?? "" });
  }

  componentDidUpdate() {
    this.openFromLink();
  }

  /** The top bar's search icon links to /content#search: open Expanded search there. */
  openFromLink() {
    if (!isBrowser() || location.hash !== "#search") return;
    history.replaceState(
      history.state,
      "",
      location.pathname + location.search,
    );
    this.setState({ expanded: true });
    this.inputRef.current?.focus();
  }

  search(text: string) {
    this.props.onSearch(text.trim() || undefined);
  }

  /** A tag chip: adds [tag] to the search, or takes it out. */
  toggleTag(tag: string) {
    const bracketed = `[${tagLabel(tag)}]`;
    const text = this.state.text;
    const has = text.toUpperCase().includes(bracketed.toUpperCase());
    this.search(
      has
        ? text.replace(new RegExp(`\\s*\\[${escapeRe(tag)}\\]`, "i"), "")
        : `${text} ${bracketed}`,
    );
  }

  async saveSaved(saved: NonNullable<State["saved"]>) {
    try {
      const res = await call<State["saved"]>("PUT", "/search_prefs", saved);
      this.setState({ saved: res, savedText: res?.saved_query ?? "" });
      toast("Saved search updated.");
      this.props.onSavedChange();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  field(name: keyof Form, label: string, placeholder = "", type = "text") {
    return (
      <div className="col-12 col-sm-6">
        <label className="form-label small mb-0" htmlFor={`search-${name}`}>
          {label}
        </label>
        <input
          id={`search-${name}`}
          type={type}
          min={type === "number" ? 0 : undefined}
          className="form-control form-control-sm"
          placeholder={placeholder}
          value={this.state.form[name]}
          onInput={e =>
            this.setState({
              form: { ...this.state.form, [name]: e.target.value },
            })
          }
        />
      </div>
    );
  }

  expandedForm() {
    const { form } = this.state;
    const select = (
      name: "type" | "date",
      label: string,
      options: [string, string][],
    ) => (
      <div className="col-12 col-sm-6">
        <label className="form-label small mb-0" htmlFor={`search-${name}`}>
          {label}
        </label>
        <select
          id={`search-${name}`}
          className="form-select form-select-sm"
          value={form[name]}
          onChange={e =>
            this.setState({ form: { ...form, [name]: e.target.value } })
          }
        >
          {options.map(([v, text]) => (
            <option value={v}>{text}</option>
          ))}
        </select>
      </div>
    );
    return (
      <form
        className="border rounded p-2 mb-2"
        onSubmit={e => {
          e.preventDefault();
          this.setState({ expanded: false });
          this.search(formQuery(form));
        }}
      >
        <div className="row g-2">
          {this.field("all", "All of these words")}
          {this.field("phrase", "This exact phrase")}
          {this.field("any", "Any of these words")}
          {this.field("none", "None of these words")}
          {this.field("tags", "With these tags", "Fdom, Aftercare")}
          {this.field("notTags", "Without these tags", "Blood")}
          {this.field("creator", "Creator")}
          {this.field("writer", "Writer")}
          {select("type", "Type", [
            ["", "Anything"],
            ["a", "Audios"],
            ["s", "Scripts (Script Offers)"],
            ["o", "Other posts"],
          ])}
          {this.field("flair", "Flair contains", "fill, offer, podcast")}
          {this.field("fillsMin", "Script fills, at least", "0", "number")}
          {this.field(
            "fillsMax",
            "Script fills, at most",
            "0 = unfilled",
            "number",
          )}
          {this.field(
            "userfillsMin",
            "Writer's fills in total, at least",
            "",
            "number",
          )}
          {select("date", "Posted", [
            ["", "Any time"],
            ["1d", "Past day"],
            ["7d", "Past week"],
            ["1m", "Past month"],
            ["1y", "Past year"],
          ])}
          {this.field("lengthMin", "Length from (minutes)", "", "number")}
          {this.field("lengthMax", "Length to (minutes)", "", "number")}
          {this.field("reactions", "Reactions, at least", "", "number")}
          {this.field("comments", "Comments, at least", "", "number")}
        </div>
        <div className="small text-muted mt-2">
          For scripts, length is in thousands of words. The form writes a search
          you can change in the box above.
        </div>
        <div className="d-flex gap-2 mt-2">
          <button type="submit" className="btn btn-sm btn-primary">
            Search
          </button>
          <button
            type="button"
            className="btn btn-sm btn-light border-light-subtle"
            onClick={() => this.setState({ form: EMPTY_FORM })}
          >
            Clear form
          </button>
        </div>
        {this.savedSearch()}
      </form>
    );
  }

  /** The saved search (like gwasi's Persistent Query), for logged-in users. */
  savedSearch() {
    const { saved, savedText } = this.state;
    if (!saved) return null;
    return (
      <div className="border-top mt-3 pt-2">
        <label className="form-label small mb-0" htmlFor="search-saved">
          Saved search, always added on the Content page
        </label>
        <div className="d-flex gap-2">
          <input
            id="search-saved"
            className="form-control form-control-sm"
            placeholder="-[blood] -u:someone t:a"
            value={savedText}
            onInput={e => this.setState({ savedText: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => this.saveSaved({ ...saved, saved_query: savedText })}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { text, expanded, tags, saved } = this.state;
    const { q, error, compact } = this.props;
    const upperQ = (q ?? "").toUpperCase();
    return (
      <div className="mb-3">
        <form
          className="d-flex gap-2 mb-2"
          role="search"
          onSubmit={e => {
            e.preventDefault();
            this.search(text);
          }}
        >
          <input
            type="search"
            className="form-control form-control-sm"
            aria-label="Search the Content page"
            placeholder='Search: words, "phrase", [tag], -word, fills:0, w:writer…'
            ref={this.inputRef}
            value={text}
            onInput={e => this.setState({ text: e.target.value })}
          />
          <button type="submit" className="btn btn-sm btn-primary">
            Search
          </button>
        </form>
        <div className="d-flex flex-wrap align-items-center gap-2 small mb-2">
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            aria-expanded={expanded}
            onClick={() => this.setState({ expanded: !expanded })}
          >
            {expanded ? "Hide expanded search" : "Expanded search"}
          </button>
          <Link to="/guides/search">Search help</Link>
          {q && (
            <button
              type="button"
              className="btn btn-link btn-sm p-0"
              onClick={() => this.search("")}
            >
              Clear search
            </button>
          )}
          <div className="form-check mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              id="search-extreme"
              checked={this.props.extreme}
              onChange={() => this.props.onExtreme(!this.props.extreme)}
            />
            <label
              className="form-check-label"
              htmlFor="search-extreme"
              title="These posts never show on the Content page itself, only in search results."
            >
              Include [Extreme] and slur tags
            </label>
          </div>
          {saved?.saved_query && (
            <div className="form-check mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                id="search-use-saved"
                checked={saved.use_saved}
                onChange={() =>
                  this.saveSaved({ ...saved, use_saved: !saved.use_saved })
                }
              />
              <label
                className="form-check-label"
                htmlFor="search-use-saved"
                title={saved.saved_query}
              >
                Use my saved search
              </label>
            </div>
          )}
          <div className="btn-group btn-group-sm ms-auto" role="group">
            {[false, true].map(c => (
              <button
                type="button"
                className={`btn ${c === compact ? "btn-secondary" : "btn-outline-secondary"} py-0`}
                aria-pressed={c === compact}
                onClick={() => {
                  saveCompact(c);
                  this.props.onCompact(c);
                }}
              >
                {c ? "Compact" : "Cards"}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="alert alert-danger py-1 small">{error}</div>}
        {/* Popular tags only in Expanded search: they take a lot of room. */}
        {expanded && tags.length > 0 && (
          <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
            <span className="small text-muted me-1">Popular tags:</span>
            {tags.slice(0, 24).map(({ tag, count: n }) => {
              const on = upperQ.includes(`[${tag}]`);
              return (
                <button
                  type="button"
                  className={`btn btn-sm py-0 ${on ? "btn-secondary" : "btn-light border-light-subtle"}`}
                  aria-pressed={on}
                  onClick={() => this.toggleTag(tag)}
                >
                  {tagLabel(tag)} <span className="opacity-75">{count(n)}</span>
                </button>
              );
            })}
          </div>
        )}
        {expanded && this.expandedForm()}
      </div>
    );
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One line per post, like gwasi: date, creator, flair, length, comments and the title. */
export function CompactPosts({ posts }: { posts: PostView[] }) {
  return (
    <ul className="list-unstyled small">
      {posts.map(pv => {
        const tags = [...pv.post.name.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
        const minutes = tags
          .map(t => lengthMinutes(t))
          .find(m => m !== undefined);
        const flair = pv.tags[0]?.display_name ?? pv.tags[0]?.name;
        return (
          <li className="py-1 border-bottom d-flex flex-wrap gap-2">
            <span className="text-muted">
              {pv.post.published_at.slice(0, 10)}
            </span>
            <Link to={`/u/${pv.creator.name}`}>{pv.creator.name}</Link>
            {flair && (
              <span className="badge text-bg-light border fw-normal">
                {flair}
              </span>
            )}
            {minutes !== undefined && (
              <span className="text-muted">{Math.round(minutes)}m</span>
            )}
            <span className="text-muted">💬 {pv.post.comments}</span>
            <Link className="text-body" to={`/post/${pv.post.id}`}>
              {pv.post.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
