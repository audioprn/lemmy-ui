// audioprn: a creator's masterlist for listeners, at /u/:username/masterlist. Their posts and their
// audios on other sites (free or paywalled), with the creator's categories worked out from tags,
// search, sorting, category / site / paywall filters, favourites (posts use Save), Surprise Me,
// 1-3 columns and reading options.
import { htmlTags } from "@components/common/html-tags";
import { Spinner } from "@components/common/icon";
import { HttpService } from "@services/index";
import { setIsoData, toast, WithHead } from "@utils/app";
import { relTags } from "@utils/config";
import { Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import { AccessibilityOptions } from "./accessibility";
import { call } from "./creator-api";
import {
  entryCategories,
  lengthMinutes,
  MasterlistCategory,
  MasterlistEntry,
} from "./masterlist";

interface MasterlistPost {
  id: number;
  name: string;
  published_at: string;
  url: string | null;
  body: string;
  tags: string[];
  credits: string[];
  creator_page: boolean;
}

interface Masterlist {
  categories: MasterlistCategory[];
  entries: MasterlistEntry[];
  posts: MasterlistPost[];
  saved_posts: number[];
  favourite_entries: number[];
}

/** A post or an entry, as a card. */
interface Item {
  key: string;
  postId?: number;
  entryId?: number;
  title: string;
  description: string;
  date: string;
  duration: string;
  writer: string;
  writerLink?: string;
  credits: string;
  tags: string[];
  categories: string[];
  links: { label: string; url: string }[];
  sites: string[];
  paywalled: boolean;
  /** Lower-case text to search. */
  text: string;
}

const SITE_NAMES: Record<string, string> = {
  "patreon.com": "Patreon",
  "subscribestar.adult": "SubscribeStar",
  "subscribestar.art": "SubscribeStar",
  "subscribestar.com": "SubscribeStar",
  "throne.com": "Throne",
  "reddit.com": "Reddit",
  "soundgasm.net": "Soundgasm",
  "hotaudio.net": "HotAudio",
  "whyp.it": "Whyp",
  "erocast.me": "Erocast",
  "scriptbin.works": "Scriptbin",
};
const THIS_SITE = "audioprn";
const PAGE = 60;
const COLUMNS_KEY = "audioprn_masterlist_columns";

function siteName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SITE_NAMES[host] ?? host;
  } catch {
    return url;
  }
}

/** Plain text from the start of a post: no lines of only [tags], no markdown marks or links. */
function plainText(markdown: string): string {
  return markdown
    .split("\n")
    .filter(line => !/^\s*(\[[^\]]*\]\s*)+$/.test(line))
    .join(" ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const creditText = (credits: string[], role: string) =>
  credits
    .filter(c => c.startsWith(`${role}:`))
    .map(c => c.slice(role.length + 1));

function fromPost(p: MasterlistPost, cats: MasterlistCategory[]): Item {
  const writer = creditText(p.credits, "writer")[0] ?? "";
  const others = [
    ...creditText(p.credits, "editor").map(n => `edit by ${n}`),
    ...creditText(p.credits, "voice_actor").map(n => `with ${n}`),
  ].join(", ");
  const title = p.name
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const description = plainText(p.body);
  // A tag like [16:10], [1:02:03] or [85 Minutes].
  const duration = p.tags.find(t => lengthMinutes(t) !== undefined) ?? "";
  return {
    key: `p${p.id}`,
    postId: p.id,
    title: title || p.name,
    description,
    date: p.published_at.slice(0, 10),
    duration: duration.toLowerCase(),
    writer: writer.replace(/^u\//, ""),
    writerLink: writer.startsWith("u/") ? `/u/${writer.slice(2)}` : undefined,
    credits: others,
    // As written in the title and text (not link texts like [Script](link)).
    tags: [
      ...new Set(
        [...`${p.name} ${p.body}`.matchAll(/\[([^[\]]{1,40})\](?!\()/g)].map(
          m => m[1].trim(),
        ),
      ),
    ],
    categories: entryCategories(p.tags, cats, null, lengthMinutes(duration)),
    links: p.url ? [{ label: siteName(p.url), url: p.url }] : [],
    sites: [THIS_SITE],
    paywalled: false,
    text: `${p.name} ${description} ${p.credits.join(" ")}`.toLowerCase(),
  };
}

function fromEntry(e: MasterlistEntry, cats: MasterlistCategory[]): Item {
  return {
    key: `e${e.id}`,
    entryId: e.id,
    title: e.title,
    description: e.description,
    date: e.date ?? "",
    duration: e.duration,
    writer: e.writer,
    writerLink: e.writer_link ?? undefined,
    credits: e.credits,
    tags: e.tags,
    categories: entryCategories(
      e.tags,
      cats,
      e.categories,
      lengthMinutes(e.duration),
    ),
    links: [
      ...e.links.map(url => ({ label: siteName(url), url })),
      ...(e.script_link ? [{ label: "Script", url: e.script_link }] : []),
    ],
    sites: [...new Set(e.links.map(siteName))],
    paywalled: e.paywalled,
    text: `${e.title} ${e.description} ${e.writer} ${e.credits} ${e.tags.join(" ")}`.toLowerCase(),
  };
}

/** A post with the details its creator imported for it from their spreadsheet. */
function withDetails(
  post: Item,
  entry: MasterlistEntry | undefined,
  cats: MasterlistCategory[],
): Item {
  if (!entry) return post;
  const d = fromEntry(entry, cats);
  return {
    ...post,
    title: d.title,
    description: d.description || post.description,
    duration: d.duration || post.duration,
    writer: d.writer || post.writer,
    writerLink: d.writer ? d.writerLink : post.writerLink,
    credits: d.credits || post.credits,
    tags: d.tags.length ? d.tags : post.tags,
    // Categories they picked for it, or those of both its tags and the post's.
    categories: entry.categories
      ? d.categories
      : [...new Set([...d.categories, ...post.categories])],
    links: [
      ...post.links,
      ...d.links.filter(l => !post.links.some(p => p.url === l.url)),
    ],
    text: `${post.text} ${d.text}`,
  };
}

const formatDate = (date: string) =>
  date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
        dateStyle: "medium",
      })
    : "";

interface State {
  personId?: number;
  /** The audio whose details are open. */
  open?: string;
  categories: MasterlistCategory[];
  items: Item[];
  favourites: Set<string>;
  q: string;
  category: string;
  site: string;
  pay: "all" | "free" | "paywalled";
  onlyFavourites: boolean;
  sort: "new" | "old" | "az";
  columns: number;
  shown: number;
  expanded: Set<string>;
  surprise?: string;
  loading: boolean;
}

type Props = RouteComponentProps<{ username: string }> & WithHead;

export class MasterlistPage extends Component<Props, State> {
  private isoData = setIsoData(this.context);
  state: State = {
    categories: [],
    items: [],
    favourites: new Set(),
    q: "",
    category: "",
    site: "",
    pay: "all",
    onlyFavourites: false,
    sort: "new",
    columns: 3,
    shown: PAGE,
    expanded: new Set(),
    loading: true,
  };

  async componentDidMount() {
    let columns = 3;
    try {
      columns = Number(localStorage.getItem(COLUMNS_KEY)) || 3;
    } catch {
      // The default, then.
    }
    this.setState({ columns });
    const res = await HttpService.client.getPersonDetails({
      username: this.props.match.params.username,
    });
    if (res.state !== "success") {
      this.setState({ loading: false });
      return;
    }
    const personId = res.data.person_view.person.id;
    const ml = await call<Masterlist>(
      "GET",
      `/masterlist?person_id=${personId}&posts=true`,
    ).catch(() => undefined);
    if (!ml) {
      this.setState({ loading: false });
      return;
    }
    this.setState({
      personId,
      loading: false,
      categories: ml.categories,
      items: [
        ...ml.posts.map(p =>
          withDetails(
            fromPost(p, ml.categories),
            ml.entries.find(e => e.post_id === p.id),
            ml.categories,
          ),
        ),
        ...ml.entries
          .filter(e => !e.post_id)
          .map(e => fromEntry(e, ml.categories)),
      ],
      favourites: new Set([
        ...ml.saved_posts.map(id => `p${id}`),
        ...ml.favourite_entries.map(id => `e${id}`),
      ]),
    });
  }

  get filtered(): Item[] {
    const { items, q, category, site, pay, onlyFavourites, sort, favourites } =
      this.state;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = items.filter(
      i =>
        words.every(w => i.text.includes(w)) &&
        (!category || i.categories.includes(category)) &&
        (!site || i.sites.includes(site)) &&
        (pay === "all" || i.paywalled === (pay === "paywalled")) &&
        (!onlyFavourites || favourites.has(i.key)),
    );
    return list.sort((a, b) =>
      sort === "az"
        ? a.title.localeCompare(b.title)
        : sort === "old"
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date),
    );
  }

  async toggleFavourite(item: Item) {
    if (!this.isoData.myUserInfo) return;
    const on = !this.state.favourites.has(item.key);
    try {
      if (item.postId) {
        const res = await HttpService.client.savePost({
          post_id: item.postId,
          save: on,
        });
        if (res.state !== "success") throw new Error("Couldn't save the post.");
      } else {
        await call("PUT", "/masterlist/favourite", {
          entry_id: item.entryId,
          favourite: on,
        });
      }
      const favourites = new Set(this.state.favourites);
      if (on) favourites.add(item.key);
      else favourites.delete(item.key);
      this.setState({ favourites });
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  surpriseMe() {
    const list = this.filtered;
    if (list.length) {
      this.setState({
        surprise: list[Math.floor(Math.random() * list.length)].key,
      });
    }
  }

  setColumns(columns: number) {
    this.setState({ columns });
    try {
      localStorage.setItem(COLUMNS_KEY, String(columns));
    } catch {
      // Not remembered, that's all.
    }
  }

  render() {
    const username = this.props.match.params.username;
    htmlTags({
      head: this.props.head,
      title: `${username}'s masterlist - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    const { loading, items, personId } = this.state;
    return (
      <div className="container-lg">
        <h1 className="h3 mb-1">{username}&apos;s masterlist</h1>
        <p className="text-muted">
          {items.length} audios ·{" "}
          <Link to={`/u/${username}`}>Creator page</Link>
        </p>
        {loading ? (
          <Spinner large />
        ) : !personId ? (
          <p>Masterlist not found.</p>
        ) : (
          this.list()
        )}
      </div>
    );
  }

  list() {
    const { categories, items, category, q, site, pay, sort, columns } =
      this.state;
    const filtered = this.filtered;
    const sites = [...new Set(items.flatMap(i => i.sites))];
    const surprise = items.find(i => i.key === this.state.surprise);
    const chip = (active: boolean) =>
      `btn btn-sm ${active ? "btn-secondary" : "btn-light border-light-subtle"}`;
    const count = (name: string) =>
      items.filter(i => i.categories.includes(name)).length;
    return (
      <div className="row">
        <aside className="col-12 col-md-3 mb-3">
          <div className="list-group small">
            <button
              type="button"
              className={`list-group-item list-group-item-action d-flex ${category ? "" : "active"}`}
              onClick={() => this.setState({ category: "", shown: PAGE })}
            >
              <span className="me-2">✨</span> All audios
              <span className="ms-auto">{items.length}</span>
            </button>
            {[...categories]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(c => (
                <button
                  type="button"
                  className={`list-group-item list-group-item-action d-flex ${category === c.name ? "active" : ""}`}
                  onClick={() =>
                    this.setState({ category: c.name, shown: PAGE })
                  }
                >
                  <span className="me-2">{c.icon || "•"}</span> {c.name}
                  <span className="ms-auto">{count(c.name)}</span>
                </button>
              ))}
          </div>
        </aside>
        <div className="col-12 col-md-9">
          <div className="d-flex flex-wrap gap-2 mb-2">
            <input
              type="search"
              className="form-control form-control-sm w-auto flex-grow-1"
              placeholder="Search titles, writers, tags…"
              aria-label="Search the masterlist"
              value={q}
              onInput={e => this.setState({ q: e.target.value, shown: PAGE })}
            />
            {(["new", "old", "az"] as const).map(s => (
              <button
                type="button"
                className={chip(sort === s)}
                onClick={() => this.setState({ sort: s })}
              >
                {{ new: "Newest", old: "Oldest", az: "A–Z" }[s]}
              </button>
            ))}
          </div>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {sites.map(s => (
              <button
                type="button"
                className={chip(site === s)}
                onClick={() =>
                  this.setState({ site: site === s ? "" : s, shown: PAGE })
                }
              >
                {s}
              </button>
            ))}
            {(["free", "paywalled"] as const).map(p => (
              <button
                type="button"
                className={chip(pay === p)}
                onClick={() =>
                  this.setState({ pay: pay === p ? "all" : p, shown: PAGE })
                }
              >
                {p === "free" ? "Free" : "🔒 Paywalled"}
              </button>
            ))}
            <button
              type="button"
              className={chip(this.state.onlyFavourites)}
              disabled={!this.isoData.myUserInfo}
              title={
                this.isoData.myUserInfo
                  ? undefined
                  : "Log in to keep favourites"
              }
              onClick={() =>
                this.setState(s => ({
                  onlyFavourites: !s.onlyFavourites,
                  shown: PAGE,
                }))
              }
            >
              ♥ Favourites
            </button>
            <button
              type="button"
              className={chip(false)}
              onClick={() => this.surpriseMe()}
            >
              🎲 Surprise me!
            </button>
            <span className="ms-auto d-flex gap-1">
              {[1, 2, 3].map(n => (
                <button
                  type="button"
                  className={chip(columns === n)}
                  aria-label={`${n} column${n > 1 ? "s" : ""}`}
                  onClick={() => this.setColumns(n)}
                >
                  {"▮".repeat(n)}
                </button>
              ))}
            </span>
          </div>
          <details className="mb-3 small">
            <summary>Reading options</summary>
            <div className="mt-2">
              <AccessibilityOptions />
            </div>
          </details>
          {this.details(items.find(i => i.key === this.state.open))}
          {surprise && (
            <div className="border border-primary rounded p-2 mb-3">
              <div className="d-flex align-items-center mb-2">
                <strong>🎲 Your surprise</strong>
                <button
                  type="button"
                  className="btn btn-sm btn-link ms-auto"
                  onClick={() => this.surpriseMe()}
                >
                  Another
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-link"
                  aria-label="Close"
                  onClick={() => this.setState({ surprise: undefined })}
                >
                  ✕
                </button>
              </div>
              {this.card(surprise)}
            </div>
          )}
          <p className="small text-muted mb-2">
            {filtered.length} audio{filtered.length === 1 ? "" : "s"}
            {category && ` in ${category}`}
          </p>
          <div className={`row row-cols-1 row-cols-md-${columns} g-3`}>
            {filtered.slice(0, this.state.shown).map(i => (
              <div className="col">{this.card(i)}</div>
            ))}
          </div>
          {filtered.length > this.state.shown && (
            <button
              type="button"
              className="btn btn-link my-3"
              onClick={() => this.setState(s => ({ shown: s.shown + PAGE }))}
            >
              Show more ({filtered.length - this.state.shown} left)
            </button>
          )}
        </div>
      </div>
    );
  }

  /** An audio's details over the page: categories, length, writer, blurb, tags and links. */
  details(item?: Item) {
    if (!item) return null;
    const close = () => this.setState({ open: undefined });
    const { categories } = this.state;
    return (
      <div
        className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-start p-3 overflow-auto"
        style="background: rgba(0, 0, 0, 0.5); z-index: 1050"
        onClick={close}
      >
        <div
          className="card w-100 my-4"
          style="max-width: 40rem"
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
          onClick={e => e.stopPropagation()}
        >
          <div className="card-body">
            <div className="d-flex align-items-start gap-2 mb-2">
              <h2 className="h5 mb-0">{item.title}</h2>
              <button
                type="button"
                className="btn-close ms-auto"
                aria-label="Close"
                onClick={close}
              />
            </div>
            <div className="small text-muted mb-2">
              {[
                formatDate(item.date),
                item.duration &&
                  `Length: ${/^[\d:]+$/.test(item.duration) ? `${item.duration} min` : item.duration}`,
              ]
                .filter(Boolean)
                .join(" · ")}
              {item.paywalled && (
                <span className="badge text-bg-warning ms-2">🔒 Paywalled</span>
              )}
            </div>
            {item.writer && (
              <div className="small">Written by: {item.writer}</div>
            )}
            {item.credits && (
              <div className="small text-muted">🎙️ {item.credits}</div>
            )}
            {item.categories.length > 0 && (
              <div className="d-flex flex-wrap gap-1 my-2">
                {item.categories.map(name => (
                  <button
                    type="button"
                    className="btn btn-sm btn-light border-light-subtle py-0"
                    onClick={() =>
                      this.setState({
                        category: name,
                        shown: PAGE,
                        open: undefined,
                      })
                    }
                  >
                    {categories.find(c => c.name === name)?.icon} {name}
                  </button>
                ))}
              </div>
            )}
            {item.description && (
              <p className="my-3" style="white-space: pre-line">
                {item.description}
              </p>
            )}
            {item.tags.length > 0 && (
              <div className="d-flex flex-wrap gap-1 mb-3">
                {item.tags.map(tag => (
                  <span className="badge text-bg-light border fw-normal">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="d-flex flex-wrap gap-2">
              {item.postId && (
                <Link
                  className="btn btn-sm btn-primary"
                  to={`/post/${item.postId}`}
                >
                  Open post
                </Link>
              )}
              {item.links.map(l => (
                <a
                  className="btn btn-sm btn-primary"
                  href={l.url}
                  rel={relTags}
                >
                  {l.label === "Script" ? "Script" : `Listen on ${l.label}`}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  card(item: Item) {
    const { categories, favourites, expanded } = this.state;
    const isFavourite = favourites.has(item.key);
    const open = expanded.has(item.key);
    const long = item.description.length > 220;
    return (
      <div className="card h-100">
        <div className="card-body d-flex flex-column">
          <div className="d-flex align-items-start gap-1">
            <div className="d-flex flex-wrap gap-1">
              {item.categories.map(name => (
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle py-0 px-1"
                  title={name}
                  aria-label={name}
                  onClick={() => this.setState({ category: name, shown: PAGE })}
                >
                  {categories.find(c => c.name === name)?.icon || "•"}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`btn btn-sm ms-auto py-0 ${isFavourite ? "text-danger" : "text-muted"}`}
              aria-label={
                isFavourite ? "Remove from favourites" : "Add to favourites"
              }
              aria-pressed={isFavourite}
              disabled={!this.isoData.myUserInfo}
              title={
                this.isoData.myUserInfo
                  ? undefined
                  : "Log in to keep favourites"
              }
              onClick={() => this.toggleFavourite(item)}
            >
              {isFavourite ? "♥" : "♡"}
            </button>
          </div>
          <h2 className="h6 mt-2 mb-1">
            {/* Opens its details: blurb, tags, length, links */}
            <button
              type="button"
              className="btn btn-link p-0 text-start fw-semibold text-decoration-none"
              onClick={() => this.setState({ open: item.key })}
            >
              {item.title}
            </button>
          </h2>
          <div className="small text-muted">
            {[
              formatDate(item.date),
              // "16:10 min", but "85 minutes" as it is
              item.duration &&
                (/^[\d:]+$/.test(item.duration)
                  ? `${item.duration} min`
                  : item.duration),
            ]
              .filter(Boolean)
              .join(" · ")}
            {item.paywalled && (
              <span className="badge text-bg-warning ms-2">🔒 Paywalled</span>
            )}
          </div>
          {item.writer && (
            <div className="small">
              Written by:{" "}
              {item.writerLink ? (
                item.writerLink.startsWith("/") ? (
                  <Link to={item.writerLink}>{item.writer}</Link>
                ) : (
                  <a href={item.writerLink} rel={relTags}>
                    {item.writer}
                  </a>
                )
              ) : (
                item.writer
              )}
            </div>
          )}
          {item.credits && (
            <div className="small text-muted">🎙️ {item.credits}</div>
          )}
          {item.description && (
            <p className="small mt-2 mb-2">
              {open || !long
                ? item.description
                : `${item.description.slice(0, 220)}…`}
              {long && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 ms-1 align-baseline"
                  onClick={() => {
                    const next = new Set(expanded);
                    if (open) next.delete(item.key);
                    else next.add(item.key);
                    this.setState({ expanded: next });
                  }}
                >
                  {open ? "Less" : "Read more"}
                </button>
              )}
            </p>
          )}
          <div className="d-flex flex-wrap gap-1 mt-auto">
            {item.postId && (
              <Link
                className="btn btn-sm btn-primary py-0"
                to={`/post/${item.postId}`}
              >
                Open post
              </Link>
            )}
            {item.links.map(l => (
              <a
                className="btn btn-sm btn-light border-light-subtle py-0"
                href={l.url}
                rel={relTags}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
