// audioprn: import scripts from a scriptbin.works export: a zip with, per script, <title>_<id>.txt
// (title, a #### line, the script) and <title>_<id>.json (dates, address, public or unlisted...).
// It's read here, in the browser. The creator ticks what to do with each group:
// - scripts linked from their Script Offer posts: the text is added to the post (members read it
//   here, watermarked; the link stays);
// - public scripts with no post here: new Script Offer posts (scriptbin link, text, original date);
// - unlisted scripts with no post: the same, unticked to start with (often other writers' work).
// New posts go through POST /reddit_import with the id "SB<scriptbin id>" (capitals: Reddit ids
// never have any, so they can't clash), so each is only
// imported once and keeps its date (and all the usual post checks apply).
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, WithHead } from "@utils/app";
import { HttpService } from "@services/index";
import { Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import { CommunityView } from "lemmy-js-client";
import { call, CreatorApiError } from "./creator-api";
import { CreatorOnly } from "./creator-status";
import { GENDER } from "./reddit-import";

interface ScriptbinPost {
  post_id: number;
  slug: string;
  has_script: boolean;
  link: string | null;
  fill_terms: string | null;
}

type Group = "posts" | "public" | "unlisted";

interface Script {
  id: string;
  title: string;
  text: string;
  date: string;
  slug: string;
  description: string;
  group: Group;
  /** Group "posts": the Script Offer posts linking this script. */
  posts: ScriptbinPost[];
  selected: boolean;
  /** "imported", or why it failed. */
  status?: string;
  postId?: number;
}

/** The files in a zip (stored or deflated), unpacked with the browser's own decompression. */
async function unzip(file: Blob): Promise<Map<string, string>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const utf8 = new TextDecoder();
  let end = bytes.length - 22;
  while (end > 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  const files = new Map<string, string>();
  let p = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0; i--) {
    const nameLength = view.getUint16(p + 28, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    const local = view.getUint32(p + 42, true);
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + view.getUint32(p + 20, true));
    const raw =
      view.getUint16(p + 10, true) === 0
        ? data
        : await new Response(
            new Blob([data])
              .stream()
              .pipeThrough(new DecompressionStream("deflate-raw")),
          ).arrayBuffer();
    files.set(name, utf8.decode(raw));
    p +=
      46 +
      nameLength +
      view.getUint16(p + 30, true) +
      view.getUint16(p + 32, true);
  }
  return files;
}

const startsWithGender = (title: string) =>
  GENDER.test(title.match(/^\[[^\]]*\]/)?.[0] ?? "");

/** A post title: no [Script Offer] tag (the flair says it), a doubled first tag once, and the
 * script's audience (like F4M) in front when the title has no gender tag. */
function postTitle(title: string, audience: string | null): string {
  let t = title
    .replace(/\[(private )?script (fill|offer)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(\[[^\]]+\])\s*\1/i, "$1");
  if (!startsWithGender(t) && audience && GENDER.test(`[${audience}]`)) {
    t = `[${audience.toUpperCase()}] ${t}`;
  }
  return t;
}

/** The title keeps its gender tags and 7 others (the Content page rule); the rest move to the
 * top of the post text, as in the Reddit import. */
function splitTags(title: string): [string, string[]] {
  const moved: string[] = [];
  let kept = 0;
  const t = title.replace(/\[[^[\]]{1,40}\]/g, tag => {
    if (GENDER.test(tag) || kept++ < 7) return tag;
    moved.push(tag);
    return "";
  });
  return [t.replace(/\s+/g, " ").trim(), moved];
}

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString(undefined, { dateStyle: "medium" });

const GROUPS: Record<Group, string> = {
  posts: "Add the script text to my Script Offer posts that link it",
  public: "New Script Offer posts for public scripts with no post here",
  unlisted: "New Script Offer posts for unlisted scripts with no post here",
};

interface State {
  scripts: Script[];
  username: string;
  creatorPage: boolean;
  communities: Partial<Record<"main" | "creators", CommunityView>>;
  importing?: { done: number; total: number };
}

type Props = RouteComponentProps<Record<string, never>> & WithHead;

export class ScriptbinImport extends Component<Props, State> {
  private isoData = setIsoData(this.context);
  state: State = {
    scripts: [],
    username: "",
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
    const files = await unzip(file).catch(() => new Map<string, string>());
    const [{ posts }, { reddit_ids }] = await Promise.all([
      call<{ posts: ScriptbinPost[] }>("GET", "/scriptbin_posts"),
      call<{ reddit_ids: string[] }>("GET", "/reddit_imports"),
    ]).catch(() => [{ posts: [] }, { reddit_ids: [] as string[] }] as const);
    const scripts: Script[] = [];
    for (const [name, json] of files) {
      const id = name.match(/_(\d+)\.json$/)?.[1];
      const txt = files.get(name.replace(/\.json$/, ".txt"));
      if (!id || txt === undefined) continue;
      const meta = JSON.parse(json) as {
        publicListed: boolean;
        created: string;
        shortDescription: string | null;
        audienceShort: string | null;
        slug: string;
        previousSlugs: { slug: string }[];
      };
      const [title, , ...lines] = txt.split(/\r?\n/);
      const slugs = [meta.slug, ...meta.previousSlugs.map(s => s.slug)];
      const linked = posts.filter(p => slugs.includes(p.slug));
      const group: Group = linked.length
        ? "posts"
        : meta.publicListed
          ? "public"
          : "unlisted";
      const imported = reddit_ids.includes(`SB${id}`);
      scripts.push({
        id,
        title: group === "posts" ? title : postTitle(title, meta.audienceShort),
        text: lines.join("\n").trim(),
        date: `${meta.created.replace(" ", "T")}Z`,
        slug: meta.slug,
        description: meta.shortDescription ?? "",
        group,
        posts: linked,
        selected: group === "posts" && !linked.every(p => p.has_script),
        status: imported ? "imported" : undefined,
      });
    }
    if (!scripts.length) {
      alert(
        "This doesn't look like a scriptbin export (a zip of .txt and .json files).",
      );
      return;
    }
    scripts.sort((a, b) => b.date.localeCompare(a.date));
    this.setState({ scripts, username: file.name.replace(/\.zip$/i, "") });
  }

  update(script: Script, change: Partial<Script>) {
    this.setState(s => ({
      scripts: s.scripts.map(x =>
        x.id === script.id ? { ...x, ...change } : x,
      ),
    }));
  }

  canImport(script: Script) {
    return (
      script.status !== "imported" &&
      (script.group === "posts" || startsWithGender(script.title))
    );
  }

  selectGroup(group: Group, selected: boolean) {
    this.setState(s => ({
      scripts: s.scripts.map(x =>
        x.group === group && this.canImport(x) ? { ...x, selected } : x,
      ),
    }));
  }

  /** Puts the text on a post, keeping its other script details. */
  saveText(
    postId: number,
    text: string,
    link?: string | null,
    fillTerms?: string | null,
  ) {
    return call("PUT", "/post_script", {
      post_id: postId,
      body: text,
      link: link ?? undefined,
      fill_terms: fillTerms ?? undefined,
    });
  }

  async importOne(script: Script) {
    if (script.group === "posts") {
      for (const post of script.posts) {
        await this.saveText(
          post.post_id,
          script.text,
          post.link,
          post.fill_terms,
        );
      }
      return;
    }
    const community =
      this.state.communities[this.state.creatorPage ? "creators" : "main"];
    const flair = community?.tags.find(
      t => t.name === "script_offer" && !t.deleted,
    );
    if (!community || !flair) throw new Error("No Script Offer flair.");
    const url = `https://scriptbin.works/u/${this.state.username.trim()}/${script.slug}`;
    const [name, moved] = splitTags(script.title);
    const body = [moved.join(" "), script.description].filter(Boolean);
    const res = await call<{ post_view: { post: { id: number } } }>(
      "POST",
      "/reddit_import",
      {
        reddit_id: `SB${script.id}`,
        date: script.date,
        credits: [],
        post: {
          name,
          community_id: community.community.id,
          url,
          body: body.join("\n\n") || undefined,
          tags: [flair.id],
        },
      },
    );
    this.update(script, { postId: res.post_view.post.id });
    await this.saveText(res.post_view.post.id, script.text, url);
  }

  async importSelected() {
    const todo = this.state.scripts.filter(s => s.selected);
    this.setState({ importing: { done: 0, total: todo.length } });
    for (const [i, script] of todo.entries()) {
      let status: string | undefined;
      while (!status) {
        try {
          await this.importOne(script);
          status = "imported";
        } catch (e) {
          if ((e as CreatorApiError).status === 429) {
            // Over the site's requests-a-minute limit: wait, then try again.
            await new Promise(r => setTimeout(r, 60_000));
          } else {
            status = (e as Error).message;
          }
        }
      }
      this.update(script, { status, selected: status !== "imported" });
      this.setState({ importing: { done: i + 1, total: todo.length } });
    }
  }

  scriptRow(script: Script) {
    const newPost = script.group !== "posts";
    return (
      <li className="list-group-item">
        <div className="d-flex gap-2 align-items-start">
          <input
            className="form-check-input mt-2"
            type="checkbox"
            aria-label="Import this script"
            checked={script.selected}
            disabled={!this.canImport(script)}
            onChange={e => this.update(script, { selected: e.target.checked })}
          />
          <div className="flex-grow-1">
            {newPost && script.status !== "imported" ? (
              <input
                className="form-control form-control-sm mb-1"
                aria-label="Title"
                value={script.title}
                onInput={e =>
                  this.update(script, {
                    title: e.target.value,
                    selected:
                      script.selected && startsWithGender(e.target.value),
                  })
                }
              />
            ) : (
              <div>{script.title}</div>
            )}
            <div className="small text-muted">
              {formatDate(script.date)} ·{" "}
              {script.text.split(/\s+/).filter(Boolean).length} words
              {newPost &&
                splitTags(script.title)[1].length > 0 &&
                ` · ${splitTags(script.title)[1].length} tags will move to the text`}
              {script.description && ` · ${script.description.slice(0, 120)}`}
            </div>
            {script.group === "posts" && (
              <div className="small">
                {script.posts.map(p => (
                  <>
                    <Link to={`/post/${p.post_id}`}>Post {p.post_id}</Link>
                    {p.has_script && " (its script text will be replaced)"}{" "}
                  </>
                ))}
              </div>
            )}
            {newPost && !startsWithGender(script.title) && (
              <div className="small text-danger">
                Start the title with a gender tag, like [F4M], to import it.
              </div>
            )}
            {script.status && (
              <div
                className={`small ${script.status === "imported" ? "text-success" : "text-danger"}`}
              >
                {script.status === "imported" ? (
                  script.postId ? (
                    <Link to={`/post/${script.postId}`}>✓ Imported</Link>
                  ) : (
                    "✓ Imported"
                  )
                ) : (
                  script.status
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Import from scriptbin - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    const { scripts, username, creatorPage, importing } = this.state;
    const selected = scripts.filter(s => s.selected).length;
    const busy = !!importing && importing.done < importing.total;
    return (
      <div className="container-lg">
        <h1 className="h3 mb-3">Import your scripts from scriptbin</h1>
        <CreatorOnly>
          {/* audioprn: placeholder wording (to be rewritten) */}
          <p>
            Download your scripts from scriptbin.works as a zip and choose it
            below. The file is read on your device; only the scripts you import
            are sent.
          </p>
          <input
            type="file"
            accept=".zip,application/zip"
            className="form-control mb-3"
            aria-label="scriptbin zip"
            onChange={e => this.readFile(e.target.files?.[0])}
          />
          {scripts.length > 0 && (
            <>
              <p>{scripts.length} scripts found.</p>
              {(Object.keys(GROUPS) as Group[]).map(group => {
                const list = scripts.filter(s => s.group === group);
                if (!list.length) return null;
                return (
                  <section className="mb-4">
                    <h2 className="h5">
                      {GROUPS[group]} ({list.length})
                    </h2>
                    {group === "unlisted" && (
                      <p className="small text-warning-emphasis">
                        These aren&rsquo;t on your scriptbin profile. Only
                        import scripts you wrote or have permission to share.
                      </p>
                    )}
                    {group !== "posts" && (
                      <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
                        <input
                          className="form-control form-control-sm w-auto"
                          aria-label="Your scriptbin username"
                          placeholder="Your scriptbin username"
                          value={username}
                          onInput={e =>
                            this.setState({ username: e.target.value })
                          }
                        />
                        <div className="form-check mb-0">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id={`scriptbin-creator-page-${group}`}
                            checked={creatorPage}
                            onChange={e =>
                              this.setState({ creatorPage: e.target.checked })
                            }
                          />
                          <label
                            className="form-check-label"
                            htmlFor={`scriptbin-creator-page-${group}`}
                          >
                            Post on my creator page instead of the Content page
                          </label>
                        </div>
                      </div>
                    )}
                    <div className="d-flex gap-2 mb-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-light border-light-subtle"
                        onClick={() => this.selectGroup(group, true)}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-light border-light-subtle"
                        onClick={() => this.selectGroup(group, false)}
                      >
                        Select none
                      </button>
                    </div>
                    <ul className="list-group">
                      {list.map(s => this.scriptRow(s))}
                    </ul>
                  </section>
                );
              })}
              <div className="d-flex align-items-center gap-3 mb-5">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!selected || busy || !username.trim()}
                  onClick={() => this.importSelected()}
                >
                  Import {selected} selected
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
