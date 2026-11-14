// audioprn: creators' masterlists. A creator's own categories (icon, tag aliases where `*`
// matches any text, and categories added along with it) and entries for audios elsewhere, free
// or paywalled. Categories are worked out from tags unless the creator picks them for an entry.
// This file: the data, working out categories, and the creator's editor at /masterlist/edit.
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, toast, WithHead } from "@utils/app";
import { Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import { call } from "./creator-api";
import { CreatorOnly } from "./creator-status";
import { shortLink } from "./news-feed";

export interface MasterlistCategory {
  name: string;
  icon: string;
  aliases: string[];
  also: string[];
}

export interface MasterlistEntry {
  id: number;
  title: string;
  description: string;
  date: string | null;
  duration: string;
  writer: string;
  writer_link: string | null;
  credits: string;
  tags: string[];
  /** null: worked out from the tags. */
  categories: string[] | null;
  links: string[];
  script_link: string | null;
  paywalled: boolean;
}

interface Masterlist {
  categories: MasterlistCategory[];
  entries: MasterlistEntry[];
}

export const getMasterlist = (personId: number) =>
  call<Masterlist>("GET", `/masterlist?person_id=${personId}`);

const escapeRegex = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** A tag alias matches a whole tag (any case); `*` matches any text. */
const aliasMatches = (alias: string, tag: string) =>
  new RegExp(
    `^${alias.toLowerCase().split("*").map(escapeRegex).join(".*")}$`,
  ).test(tag.toLowerCase());

/** Minutes in a length like "1:02:03", "16:10" or "85 minutes"; undefined if it isn't one. */
export function lengthMinutes(text: string): number | undefined {
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (clock) {
    return (
      Number(clock[1] ?? 0) * 60 + Number(clock[2]) + Number(clock[3]) / 60
    );
  }
  const minutes = /^(\d+)\s*(?:m|mins?|minutes?)$/i.exec(text.trim());
  return minutes ? Number(minutes[1]) : undefined;
}

/** A category tag like ">40min" or "<15min" is a rule on the audio's length. */
const LENGTH_RULE = /^([<>])\s*(\d+)\s*min$/i;

function aliasApplies(alias: string, tags: string[], minutes?: number) {
  const rule = LENGTH_RULE.exec(alias.trim());
  if (rule) {
    return (
      minutes !== undefined &&
      (rule[1] === ">" ? minutes > Number(rule[2]) : minutes < Number(rule[2]))
    );
  }
  return tags.some(tag => aliasMatches(alias, tag));
}

/**
 * An audio's categories: those whose name or an alias matches one of its tags (or whose length
 * rule fits it), plus the categories they add along with them. In the creator's category order.
 */
export function entryCategories(
  tags: string[],
  categories: MasterlistCategory[],
  chosen?: string[] | null,
  minutes?: number,
): string[] {
  if (chosen) return chosen;
  const found = new Set(
    categories
      .filter(c =>
        [c.name, ...c.aliases].some(alias =>
          aliasApplies(alias, tags, minutes),
        ),
      )
      .map(c => c.name),
  );
  for (let added = true; added;) {
    added = false;
    for (const c of categories) {
      if (!found.has(c.name)) continue;
      for (const also of c.also) {
        const other = categories.find(
          o => o.name.toLowerCase() === also.toLowerCase(),
        );
        if (other && !found.has(other.name)) {
          found.add(other.name);
          added = true;
        }
      }
    }
  }
  return categories.filter(c => found.has(c.name)).map(c => c.name);
}

const splitList = (text: string, separator: string | RegExp) =>
  text
    .split(separator)
    .map(s => s.trim())
    .filter(Boolean);

const NEW_ENTRY: MasterlistEntry = {
  id: 0,
  title: "",
  description: "",
  date: null,
  duration: "",
  writer: "",
  writer_link: null,
  credits: "",
  tags: [],
  categories: null,
  links: [],
  script_link: null,
  paywalled: false,
};

/** The editor's text fields for a category (lists as comma-separated text). */
interface CategoryDraft {
  name: string;
  icon: string;
  aliases: string;
  also: string;
}

/** The editor's text fields for an entry. */
interface EntryDraft extends Omit<MasterlistEntry, "tags" | "links" | "date"> {
  date: string;
  tags: string;
  links: string;
}

const toCategoryDraft = (c: MasterlistCategory): CategoryDraft => ({
  name: c.name,
  icon: c.icon,
  aliases: c.aliases.join(", "),
  also: c.also.join(", "),
});

const toEntryDraft = (e: MasterlistEntry): EntryDraft => ({
  ...e,
  date: e.date ?? "",
  tags: e.tags.join(", "),
  links: e.links.join("\n"),
});

const fromEntryDraft = (d: EntryDraft): MasterlistEntry => ({
  ...d,
  date: d.date || null,
  tags: splitList(d.tags, ","),
  links: splitList(d.links, /\s+/),
  writer_link: d.writer_link?.trim() || null,
  script_link: d.script_link?.trim() || null,
});

interface EditorState {
  loaded: boolean;
  categories: MasterlistCategory[];
  categoryDrafts: CategoryDraft[];
  entries: MasterlistEntry[];
  entry?: EntryDraft;
}

type Props = RouteComponentProps<Record<string, never>> & WithHead;

/** /masterlist/edit: the creator manages their categories and other-site entries. */
export class MasterlistEditor extends Component<Props, EditorState> {
  private isoData = setIsoData(this.context);
  state: EditorState = {
    loaded: false,
    categories: [],
    categoryDrafts: [],
    entries: [],
  };

  async componentDidMount() {
    const me = this.isoData.myUserInfo?.local_user_view.person.id;
    if (!me) return;
    const { categories, entries } = await getMasterlist(me);
    this.setState({
      loaded: true,
      categories,
      categoryDrafts: categories.map(toCategoryDraft),
      entries,
    });
  }

  async saveCategories() {
    try {
      const { categories } = await call<Masterlist>(
        "PUT",
        "/masterlist/categories",
        {
          categories: this.state.categoryDrafts.map(d => ({
            name: d.name,
            icon: d.icon,
            aliases: splitList(d.aliases, ","),
            also: splitList(d.also, ","),
          })),
        },
      );
      this.setState({
        categories,
        categoryDrafts: categories.map(toCategoryDraft),
      });
      toast("Categories saved.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  updateCategory(i: number, change: Partial<CategoryDraft>) {
    this.setState(s => ({
      categoryDrafts: s.categoryDrafts.map((d, j) =>
        j === i ? { ...d, ...change } : d,
      ),
    }));
  }

  async saveEntry(draft: EntryDraft) {
    try {
      const saved = await call<MasterlistEntry>(
        "PUT",
        "/masterlist/entry",
        fromEntryDraft(draft),
      );
      this.setState(s => ({
        entry: undefined,
        entries: draft.id
          ? s.entries.map(e => (e.id === saved.id ? saved : e))
          : [saved, ...s.entries],
      }));
      toast("Entry saved.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  async deleteEntry(entry: MasterlistEntry) {
    if (!confirm(`Delete "${entry.title}" from your masterlist?`)) return;
    try {
      await call("DELETE", "/masterlist/entry", { id: entry.id });
      this.setState(s => ({ entries: s.entries.filter(e => e !== entry) }));
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  categoryIcons(names: string[]) {
    return names
      .map(n => this.state.categories.find(c => c.name === n))
      .map(c => c && <span title={c.name}>{c.icon || "•"}</span>);
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Edit my masterlist - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    const me = this.isoData.myUserInfo?.local_user_view.person.name;
    return (
      <div className="container-lg">
        <h1 className="h3 mb-3">Edit my masterlist</h1>
        <CreatorOnly>
          <p>
            Your masterlist lists your posts here and the audios you have on
            other sites, free or paywalled.{" "}
            {me && <Link to={`/u/${me}`}>Back to my page</Link>}
          </p>
          {this.state.loaded && (
            <>
              {this.categoriesSection()}
              {this.entriesSection()}
            </>
          )}
        </CreatorOnly>
      </div>
    );
  }

  categoriesSection() {
    const { categoryDrafts } = this.state;
    return (
      <section className="card card-body mb-4">
        <h2 className="h5">Categories</h2>
        <p className="small text-muted">
          An audio is in a category when one of its tags matches the
          category&apos;s name or one of its tags (any capitals; <code>*</code>{" "}
          matches any text, e.g. <code>* blowjob</code>). &ldquo;Also
          adds&rdquo; puts it in other categories too (e.g. Deepthroat also adds
          Blowjob). A tag like <code>{">40min"}</code> or{" "}
          <code>{"<15min"}</code> picks audios by length.
        </p>
        {categoryDrafts.map((d, i) => (
          <div className="row g-2 mb-2 align-items-start">
            <div className="col-2 col-md-1">
              <input
                className="form-control form-control-sm text-center"
                aria-label="Icon"
                placeholder="🙂"
                value={d.icon}
                onInput={e => this.updateCategory(i, { icon: e.target.value })}
              />
            </div>
            <div className="col-10 col-md-3">
              <input
                className="form-control form-control-sm"
                aria-label="Category name"
                placeholder="Name"
                value={d.name}
                onInput={e => this.updateCategory(i, { name: e.target.value })}
              />
            </div>
            <div className="col-12 col-md-4">
              <input
                className="form-control form-control-sm"
                aria-label="Tags (comma-separated)"
                placeholder="Tags, e.g. 69, * blowjob"
                value={d.aliases}
                onInput={e =>
                  this.updateCategory(i, { aliases: e.target.value })
                }
              />
            </div>
            <div className="col-10 col-md-3">
              <input
                className="form-control form-control-sm"
                aria-label="Also adds (comma-separated)"
                placeholder="Also adds"
                value={d.also}
                onInput={e => this.updateCategory(i, { also: e.target.value })}
              />
            </div>
            <div className="col-2 col-md-1">
              <button
                type="button"
                className="btn btn-sm btn-link text-danger"
                aria-label="Remove category"
                onClick={() =>
                  this.setState(s => ({
                    categoryDrafts: s.categoryDrafts.filter((_, j) => j !== i),
                  }))
                }
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-light border-light-subtle"
            onClick={() =>
              this.setState(s => ({
                categoryDrafts: [
                  ...s.categoryDrafts,
                  { name: "", icon: "", aliases: "", also: "" },
                ],
              }))
            }
          >
            + Add category
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => this.saveCategories()}
          >
            Save categories
          </button>
        </div>
      </section>
    );
  }

  entriesSection() {
    const { entries, entry, categories } = this.state;
    return (
      <section className="card card-body mb-5">
        <h2 className="h5">Audios on other sites ({entries.length})</h2>
        <p className="small text-muted">
          Your posts here are on your masterlist automatically. Add the audios
          you have elsewhere, like Patreon or SubscribeStar.
        </p>
        {entry ? (
          this.entryForm(entry)
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-primary align-self-start mb-3"
            onClick={() => this.setState({ entry: toEntryDraft(NEW_ENTRY) })}
          >
            + Add an audio
          </button>
        )}
        <ul className="list-group">
          {entries.map(e => (
            <li className="list-group-item d-flex flex-wrap align-items-center gap-2">
              <span className="me-1">
                {this.categoryIcons(
                  entryCategories(
                    e.tags,
                    categories,
                    e.categories,
                    lengthMinutes(e.duration),
                  ),
                )}
              </span>
              <strong>{e.title}</strong>
              <span className="small text-muted">
                {e.date ?? "No date"}
                {e.paywalled && " · Paywalled"}
                {e.links.length > 0 &&
                  ` · ${e.links.map(shortLink).join(", ")}`}
              </span>
              <span className="ms-auto d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle py-0"
                  onClick={() => this.setState({ entry: toEntryDraft(e) })}
                >
                  ✏️ Edit
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle py-0"
                  onClick={() => this.deleteEntry(e)}
                >
                  🗑 Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  entryForm(d: EntryDraft) {
    const { categories } = this.state;
    const set = (change: Partial<EntryDraft>) =>
      this.setState({ entry: { ...d, ...change } });
    const auto = entryCategories(
      splitList(d.tags, ","),
      categories,
      null,
      lengthMinutes(d.duration),
    );
    const field = (
      key: "title" | "duration" | "writer" | "credits",
      label: string,
      placeholder = "",
    ) => (
      <div className="col-12 col-md-6">
        <label className="form-label small mb-0">{label}</label>
        <input
          className="form-control form-control-sm"
          placeholder={placeholder}
          value={d[key]}
          onInput={e => set({ [key]: e.target.value })}
        />
      </div>
    );
    return (
      <div className="border rounded p-3 mb-3">
        <div className="row g-2 mb-2">
          {field("title", "Title")}
          <div className="col-6 col-md-3">
            <label className="form-label small mb-0">Date</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={d.date}
              onInput={e => set({ date: e.target.value })}
            />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small mb-0">Length</label>
            <input
              className="form-control form-control-sm"
              placeholder="0:16:10"
              value={d.duration}
              onInput={e => set({ duration: e.target.value })}
            />
          </div>
          {field("writer", "Written by")}
          <div className="col-12 col-md-6">
            <label className="form-label small mb-0">Writer&apos;s link</label>
            <input
              type="url"
              className="form-control form-control-sm"
              value={d.writer_link ?? ""}
              onInput={e => set({ writer_link: e.target.value })}
            />
          </div>
          {field("credits", "Collaborators", "e.g. edit by …, with …")}
          <div className="col-12 col-md-6">
            <label className="form-label small mb-0">Script link</label>
            <input
              type="url"
              className="form-control form-control-sm"
              value={d.script_link ?? ""}
              onInput={e => set({ script_link: e.target.value })}
            />
          </div>
          <div className="col-12">
            <label className="form-label small mb-0">Description</label>
            <textarea
              className="form-control form-control-sm"
              rows={3}
              value={d.description}
              onInput={e => set({ description: e.target.value })}
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small mb-0">
              Tags (comma-separated)
            </label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              placeholder="F4M, Romance, Blowjob"
              value={d.tags}
              onInput={e => set({ tags: e.target.value })}
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small mb-0">
              Links (one per line: Patreon, SubscribeStar, …)
            </label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              value={d.links}
              onInput={e => set({ links: e.target.value })}
            />
          </div>
        </div>
        <div className="form-check mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="entry-paywalled"
            checked={d.paywalled}
            onChange={e => set({ paywalled: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="entry-paywalled">
            Paywalled
          </label>
        </div>
        <div className="mb-2">
          <div className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              id="entry-auto-categories"
              checked={!d.categories}
              onChange={e =>
                set({ categories: e.target.checked ? null : auto })
              }
            />
            <label className="form-check-label" htmlFor="entry-auto-categories">
              Categories from the tags
              {!d.categories && `: ${auto.join(", ") || "none yet"}`}
            </label>
          </div>
          {d.categories && (
            <div className="d-flex flex-wrap gap-3 mt-1">
              {categories.map(c => (
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`entry-cat-${c.name}`}
                    checked={d.categories?.includes(c.name)}
                    onChange={e =>
                      set({
                        categories: e.target.checked
                          ? [...(d.categories ?? []), c.name]
                          : (d.categories ?? []).filter(n => n !== c.name),
                      })
                    }
                  />
                  <label
                    className="form-check-label"
                    htmlFor={`entry-cat-${c.name}`}
                  >
                    {c.icon} {c.name}
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => this.saveEntry(d)}
          >
            Save
          </button>
          <button
            type="button"
            className="btn btn-sm btn-light border-light-subtle"
            onClick={() => this.setState({ entry: undefined })}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
}
