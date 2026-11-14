// audioprn: creators' masterlists. A creator's own categories (icon, tag aliases where `*`
// matches any text, and categories added along with it) and entries for audios elsewhere, free
// or paywalled. Categories are worked out from tags unless the creator picks them for an entry.
// This file: the data, working out categories, and the creator's editor at /masterlist/edit.
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, toast, WithHead } from "@utils/app";
import { Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import { call, CreatorApiError } from "./creator-api";
import { CreatorOnly } from "./creator-status";
import { shortLink } from "./news-feed";
import { parseCsv } from "./reddit-import";

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
  /** The post this entry adds details to (imported from a spreadsheet). */
  post_id: number | null;
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

/** Minutes in a length like "1:02:03", "16:10", "22m 52s" or "85 minutes"; else undefined. */
export function lengthMinutes(text: string): number | undefined {
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (clock) {
    return (
      Number(clock[1] ?? 0) * 60 + Number(clock[2]) + Number(clock[3]) / 60
    );
  }
  // "1h 05m", "22m 52s", "28m", "85 minutes"
  const parts =
    /^(?:(\d+)\s*h\s*)?(?:(\d+)\s*m(?:in(?:ute)?s?)?\s*)?(?:(\d+)\s*s)?$/i.exec(
      text.trim(),
    );
  if (!parts || !(parts[1] || parts[2] || parts[3])) return undefined;
  return (
    Number(parts[1] ?? 0) * 60 +
    Number(parts[2] ?? 0) +
    Number(parts[3] ?? 0) / 60
  );
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
  post_id: null,
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
  importPaywalled: boolean;
  importing?: string;
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
    importPaywalled: false,
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
              {this.importSection()}
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

  /** Rows of a CSV file chosen in the page, with a column finder by header name. */
  async readCsv(file?: File) {
    if (!file) return undefined;
    const [header, ...rows] = parseCsv(await file.text());
    const names = header.map(h => h.trim().toLowerCase());
    const col = (...wanted: string[]) =>
      names.findIndex(n => wanted.includes(n));
    return { rows: rows.filter(r => r.some(Boolean)), col };
  }

  /** "Tag as written, Category" or "If Selected, Also Select" rows into the category drafts. */
  async importCategoryCsv(file: File | undefined, kind: "aliases" | "also") {
    const csv = await this.readCsv(file);
    if (!csv) return;
    const drafts = [...this.state.categoryDrafts];
    const draft = (name: string) => {
      let d = drafts.find(x => x.name.toLowerCase() === name.toLowerCase());
      if (!d) {
        d = { name, icon: "", aliases: "", also: "" };
        drafts.push(d);
      }
      return d;
    };
    let added = 0;
    for (const [first = "", second = ""] of csv.rows) {
      const [a, b] = [first.trim(), second.trim()];
      if (!a || !b) continue;
      // Aliases: tag, category. Also adds: category, the category it adds.
      const d = draft(kind === "aliases" ? b : a);
      const value = kind === "aliases" ? a : b;
      const list = splitList(d[kind], ",");
      if (!list.some(x => x.toLowerCase() === value.toLowerCase())) {
        d[kind] = [...list, value].join(", ");
        added++;
      }
    }
    this.setState({ categoryDrafts: drafts });
    toast(
      `${added} added to the categories. Check them, then Save categories.`,
    );
  }

  /** Audio rows (columns like the masterlist sheet's) to the import API, 100 at a time. */
  async importAudios(file?: File) {
    const csv = await this.readCsv(file);
    if (!csv) return;
    const { rows, col } = csv;
    const get = (row: string[], ...names: string[]) =>
      (row[col(...names)] ?? "").trim();
    const isLink = (s: string) => /^https?:\/\//i.test(s);
    const known = new Map(
      this.state.categories.map(c => [c.name.toLowerCase(), c.name]),
    );
    const unknown = new Set<string>();
    const entries = rows
      .filter(row => get(row, "title"))
      .map(row => {
        const postLink = get(row, "post link", "link");
        const audioLink = get(row, "audio link");
        const chosen = splitList(get(row, "category", "categories"), ",")
          .map(name => {
            if (!known.has(name.toLowerCase())) unknown.add(name);
            return known.get(name.toLowerCase());
          })
          .filter((n): n is string => !!n);
        // 2025-07-24, or day/month/year: 24/07/2025
        const date = get(row, "date");
        const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);
        return {
          ...NEW_ENTRY,
          title: get(row, "title"),
          description: get(row, "description", "synopsis"),
          date: /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? date
            : dmy
              ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`
              : null,
          duration: get(row, "duration", "length"),
          writer: get(row, "writer", "written by"),
          writer_link: get(row, "writer link") || null,
          credits: get(row, "collab partners", "collaborators", "credits"),
          // Comma-separated; a piece like "[F4M][Romance] [Slow Burn]" is several tags.
          tags: splitList(get(row, "tags"), ",").flatMap(tag =>
            tag.includes("[")
              ? [...tag.matchAll(/\[([^\]]+)\]/g)].map(m => m[1].trim())
              : [tag],
          ),
          categories: chosen.length ? chosen : null,
          links: [postLink, audioLink].filter(isLink),
          script_link: isLink(get(row, "script link"))
            ? get(row, "script link")
            : null,
          paywalled: this.state.importPaywalled,
          reddit_id:
            /reddit\.com\/r\/[^/]+\/comments\/([a-z0-9]+)/i.exec(
              postLink,
            )?.[1] ?? null,
        };
      });
    const total = { added: 0, updated: 0, posts: 0, skipped: 0 };
    for (let i = 0; i < entries.length;) {
      this.setState({ importing: `Importing ${i} of ${entries.length}…` });
      try {
        const res = await call<typeof total>("PUT", "/masterlist/import", {
          entries: entries.slice(i, i + 100),
        });
        Object.keys(total).forEach(k => {
          total[k as keyof typeof total] += res[k as keyof typeof total];
        });
        i += 100;
      } catch (e) {
        if ((e as CreatorApiError).status !== 429) {
          this.setState({ importing: (e as Error).message });
          return;
        }
        // Over the site's requests-a-minute limit: wait, then try again.
        await new Promise(r => setTimeout(r, 60_000));
      }
    }
    const me = this.isoData.myUserInfo?.local_user_view.person.id;
    if (me) this.setState({ entries: (await getMasterlist(me)).entries });
    this.setState({
      importing:
        `Done: ${total.added} added, ${total.updated} updated (${total.posts} of them your posts), ` +
        `${total.skipped} skipped.` +
        (unknown.size
          ? ` Categories not on your list, left out: ${[...unknown].join(", ")}.`
          : ""),
    });
  }

  importSection() {
    const { entries, importing, importPaywalled } = this.state;
    const file = (label: string, onChange: (f?: File) => void) => (
      <div className="mb-2">
        <label className="form-label small mb-0">{label}</label>
        <input
          type="file"
          accept=".csv,text/csv"
          className="form-control form-control-sm"
          onChange={e => onChange(e.target.files?.[0])}
        />
      </div>
    );
    return (
      <section className="card card-body mb-4">
        <h2 className="h5">Import from your spreadsheet</h2>
        <p className="small text-muted">
          Download a tab as CSV (in Google Sheets: File → Download →
          Comma-separated values) and choose it here. Columns are found by their
          names.
        </p>
        {file("Tag aliases (columns: Tag as written, Category)", f =>
          this.importCategoryCsv(f, "aliases"),
        )}
        {file("Double selects (columns: If Selected, Also Select)", f =>
          this.importCategoryCsv(f, "also"),
        )}
        <p className="small text-muted">
          These add to your categories above: check them, add icons, then Save
          categories. Import your categories before your audios.
        </p>
        <div className="form-check mb-1">
          <input
            className="form-check-input"
            type="checkbox"
            id="import-paywalled"
            checked={importPaywalled}
            onChange={e => this.setState({ importPaywalled: e.target.checked })}
          />
          <label className="form-check-label" htmlFor="import-paywalled">
            The audios in this file are paywalled
          </label>
        </div>
        {file(
          "Audios (columns like Title, Category, Tags, Date, Writer, Script Link, Description, Post Link, Collab Partners, Duration, Audio Link)",
          f => this.importAudios(f),
        )}
        <p className="small text-muted mb-1">
          A row whose Post Link is one of your Reddit posts imported here adds
          its details (title, description, length, writer, categories) to that
          post. Other rows become audios below. Importing again updates them.
        </p>
        {importing && <p className="small mb-1">{importing}</p>}
        <p className="small mb-0">
          {entries.filter(e => e.post_id).length} of your posts have details
          from your spreadsheet.
        </p>
      </section>
    );
  }

  entriesSection() {
    const { entry, categories } = this.state;
    // Entries adding details to posts are counted in the import section.
    const entries = this.state.entries.filter(e => !e.post_id);
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
