// audioprn: the content filters in the Content page's left column (search is in the top bar).
// Filters live in the URL (`filters`, comma-separated) and go to the backend as
// `content_filters`. No `filters` in the URL means the defaults, which show everything.
import { setIsoData, toast } from "@utils/app";
import { amAdmin } from "@utils/roles";
import { Component, linkEvent } from "inferno";
import { call } from "./creator-api";
import { MAIN_COMMUNITY_NAME, SHOW_COMMUNITIES } from "./features";

const FILTERS = [
  { name: "f_listener", label: "Content for F listener" },
  { name: "m_listener", label: "Content for M listener" },
  { name: "f_voices", label: "F voices only" },
  { name: "m_voices", label: "M voices only" },
  { name: "no_taboo", label: "No Taboo" },
  { name: "no_rape", label: "No Rape" },
  { name: "no_incest", label: "No Incest" },
  { name: "sfw", label: "Show SFW" }, // posts tagged [SFW] are hidden unless ticked
  { name: "scripts", label: "Scripts Only" },
  { name: "audios", label: "Audios Only" },
];
const DEFAULT_FILTERS = "f_listener,m_listener";
const STORAGE_KEY = "audioprn_content_filters";

/**
 * The backend parameters for the Content feed: `content_page` leaves out creators' own page posts
 * and posts kept off Content, then these filters (none = the defaults, which show everything).
 */
export function contentFilters(filters?: string, q?: string) {
  // The dark cummunity's tags only ever show in search results.
  const list = (filters ?? DEFAULT_FILTERS)
    .split(",")
    .filter(f => q || f !== EXTREME);
  return {
    ...(SHOW_COMMUNITIES ? {} : { community_name: MAIN_COMMUNITY_NAME }),
    content_filters: `content_page,${list.join(",")}`,
  };
}

/** Search results also show posts with the dark cummunity's tags ([Extreme], slurs). */
export const EXTREME = "extreme";

/** The filters with `name` turned on or off, as kept in the URL (and remembered). */
export function setFilter(
  filters: string | undefined,
  name: string,
  on: boolean,
) {
  const list = (filters ?? DEFAULT_FILTERS)
    .split(",")
    .filter(f => f !== name && f !== "none");
  return normalizeFilters(on ? [...list, name] : list);
}

function normalizeFilters(filters: string[]): string | undefined {
  // "none" keeps an all-unchecked state in the URL; the backend ignores unknown names.
  const value = filters.filter(Boolean).sort().join(",") || "none";
  const next = value === DEFAULT_FILTERS ? undefined : value;
  saveFilters(next);
  return next;
}

/** The viewer's last filters, to restore when they come back. */
export function savedFilters(): string | undefined {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveFilters(filters: string | undefined) {
  try {
    if (filters) localStorage.setItem(STORAGE_KEY, filters);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered, that's all.
  }
}

interface Props {
  filters?: string;
  q?: string;
  showFollowList: boolean;
  onChange: (change: { filters?: string; q?: string }) => void;
}

export class ContentFilters extends Component<Props, object> {
  private isoData = setIsoData(this.context);

  get active(): string[] {
    return (this.props.filters ?? DEFAULT_FILTERS).split(",");
  }

  setFilters(filters: string[]) {
    this.props.onChange({
      filters: normalizeFilters(filters),
      q: this.props.q,
    });
  }

  toggle(name: string) {
    const active = this.active;
    this.setFilters(
      active.includes(name)
        ? active.filter(f => f !== name)
        : [...active, name],
    );
  }

  render() {
    const active = this.active;
    return (
      <div className="mb-3">
        {/* The search box is in the top bar; this shows and clears the current search. */}
        {this.props.q && (
          <div className="small mb-2">
            Results for “{this.props.q}”{" "}
            <button
              type="button"
              className="btn btn-link btn-sm p-0 align-baseline"
              onClick={() =>
                this.props.onChange({
                  filters: this.props.filters,
                  q: undefined,
                })
              }
            >
              Clear
            </button>
          </div>
        )}
        <div className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            id="filter-show-all"
            // The search-only [Extreme] box doesn't count.
            checked={
              this.active.filter(f => f !== EXTREME).join(",") ===
              DEFAULT_FILTERS
            }
            onChange={linkEvent(this, i => i.setFilters([DEFAULT_FILTERS]))}
          />
          <label className="form-check-label" htmlFor="filter-show-all">
            Show All NSFW
          </label>
        </div>
        {[
          ...FILTERS,
          ...(this.props.showFollowList
            ? [{ name: "followed", label: "Follow List Only" }]
            : []),
        ].map(({ name, label }) => (
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id={`filter-${name}`}
              checked={active.includes(name)}
              onChange={linkEvent(this, i => i.toggle(name))}
            />
            <label className="form-check-label" htmlFor={`filter-${name}`}>
              {label}
            </label>
          </div>
        ))}
        {amAdmin(this.isoData.myUserInfo) && <TabooEditor />}
      </div>
    );
  }
}

/** Admins: the tags that make a post Taboo (for "No Taboo"). Saving re-checks every post. */
class TabooEditor extends Component<object, { text?: string }> {
  state: { text?: string } = {};

  async load() {
    if (this.state.text !== undefined) return;
    const { tags } = await call<{ tags: string[] }>("GET", "/taboo_tags");
    this.setState({ text: tags.map(t => `[${t}]`).join(", ") });
  }

  async save() {
    try {
      const { tags } = await call<{ tags: string[] }>("PUT", "/taboo_tags", {
        tags: (this.state.text ?? "").split(","),
      });
      this.setState({ text: tags.map(t => `[${t}]`).join(", ") });
      toast("Taboo list saved. Every post was re-checked.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    return (
      <details className="small mt-2" onToggle={() => this.load()}>
        <summary className="text-muted">Taboo tags (admins)</summary>
        <textarea
          className="form-control form-control-sm mt-1"
          rows={4}
          aria-label="Taboo tags, comma-separated"
          value={this.state.text ?? ""}
          onInput={e => this.setState({ text: e.target.value })}
        />
        <button
          type="button"
          className="btn btn-sm btn-secondary mt-1"
          disabled={this.state.text === undefined}
          onClick={() => this.save()}
        >
          Save
        </button>
      </details>
    );
  }
}
