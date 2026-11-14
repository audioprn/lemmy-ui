// audioprn: news flashes. Site news (admins) at the top of the Content left column; community news
// (the community's mods) on community pages, which admins can also show in the site news; a
// creator's own news on their profile. My audioprn shows the site news plus news from followed
// creators and joined communities. Up to 300 characters, every link counts as 23 and shows
// shortened. Whoever can post sees Bluesky and X links to share a flash there too.
import { amAdmin } from "@utils/roles";
import { setIsoData, toast } from "@utils/app";
import { relTags } from "@utils/config";
import { Component } from "inferno";
import { call } from "./creator-api";

interface NewsFlash {
  id: number;
  body: string;
  published_at: string;
  community_id: number | null;
  in_main: boolean;
  community_title: string | null;
  person_id: number | null;
  creator_name: string | null;
}

const MAX_LENGTH = 300;
const LINK_LENGTH = 23;
const LINK = /https?:\/\/\S+/g;

const countedLength = (body: string) =>
  body.replace(LINK, "").length + (body.match(LINK)?.length ?? 0) * LINK_LENGTH;

/** "https://www.example.com/a/long/path" -> "example.com/a/long/pa…" */
export function shortLink(url: string) {
  const short = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return short.length > LINK_LENGTH
    ? `${short.slice(0, LINK_LENGTH - 1)}…`
    : short;
}

/** The text with its links shortened and clickable. */
function NewsBody({ body }: { body: string }) {
  const parts = body.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a href={part} rel={relTags} title={part}>
            {shortLink(part)}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** Without any of these: the site news. */
interface Props {
  /** A community page's news (its mods post it). */
  communityId?: number;
  /** A creator's own news, on their profile. */
  personId?: number;
  /** My audioprn: site news plus followed creators' and joined communities' news. */
  my?: boolean;
}

const shareLinks = (body: string) => [
  [
    "Post to Bluesky",
    `https://bsky.app/intent/compose?text=${encodeURIComponent(body)}`,
  ],
  ["Post to X", `https://x.com/intent/post?text=${encodeURIComponent(body)}`],
];

export class NewsFeed extends Component<
  Props,
  { news: NewsFlash[]; draft: string; canPostOwn: boolean }
> {
  private isoData = setIsoData(this.context);
  state = { news: [] as NewsFlash[], draft: "", canPostOwn: false };

  async componentDidMount() {
    const { communityId, personId, my } = this.props;
    const res = await call<{ news: NewsFlash[]; can_post: boolean }>(
      "GET",
      communityId
        ? `/news?community_id=${communityId}`
        : personId
          ? `/news?person_id=${personId}`
          : `/news${my ? "?my=true" : ""}`,
    ).catch(() => ({ news: [], can_post: false }));
    this.setState({ news: res.news, canPostOwn: res.can_post });
  }

  /**
   * Admins post site news and manage all news; a community's mods its community news; creators
   * their own news.
   */
  get canPost() {
    const { communityId, personId } = this.props;
    if (personId) return this.state.canPostOwn;
    const mui = this.isoData.myUserInfo;
    return (
      amAdmin(mui) ||
      (!!communityId &&
        !!mui?.moderates.some(m => m.community.id === communityId))
    );
  }

  async post(event: Event) {
    event.preventDefault();
    try {
      const flash = await call<NewsFlash>("POST", "/news", {
        body: this.state.draft,
        community_id: this.props.communityId,
        mine: !!this.props.personId,
      });
      this.setState({ news: [flash, ...this.state.news], draft: "" });
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  async remove(id: number) {
    if (!confirm("Delete this news flash?")) return;
    await call("DELETE", "/news", { id });
    this.setState({ news: this.state.news.filter(n => n.id !== id) });
  }

  /** Admins: show a community flash in the site news, or not. */
  async setInMain(flash: NewsFlash, in_main: boolean) {
    await call("PUT", "/news/main", { id: flash.id, in_main });
    this.setState({
      news: this.state.news.map(n =>
        n.id === flash.id ? { ...n, in_main } : n,
      ),
    });
  }

  render() {
    const admin = amAdmin(this.isoData.myUserInfo);
    const canPost = this.canPost;
    const { news, draft } = this.state;
    if (!canPost && news.length === 0) return null;
    const left = MAX_LENGTH - countedLength(draft.trim());
    return (
      <section className="card card-body mb-3 p-2">
        <h2 className="h6 mb-2">
          📣{" "}
          {this.props.communityId
            ? "Cummunity news"
            : this.props.personId
              ? "Creator news"
              : "News"}
        </h2>
        {canPost && (
          <form className="mb-2" onSubmit={e => this.post(e)}>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              placeholder="Post a news flash"
              aria-label="News flash"
              value={draft}
              onInput={e => this.setState({ draft: e.target.value })}
            />
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span
                className={`small ${left < 0 ? "text-danger" : "text-muted"}`}
              >
                {left}
              </span>
              <button
                type="submit"
                className="btn btn-sm btn-secondary"
                disabled={!draft.trim() || left < 0}
              >
                Post
              </button>
            </div>
          </form>
        )}
        {news.map(n => (
          <div className="small border-top pt-1 mt-1">
            {!this.props.communityId &&
              !this.props.personId &&
              (n.community_title ?? n.creator_name) && (
                <div className="text-muted">
                  {n.community_title ?? n.creator_name}:
                </div>
              )}
            <NewsBody body={n.body} />
            <div className="text-muted">
              {new Date(n.published_at).toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
              {canPost && (
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 ms-2 align-baseline"
                  onClick={() => this.remove(n.id)}
                >
                  Delete
                </button>
              )}
              {canPost &&
                shareLinks(n.body).map(([site, href]) => (
                  <a className="ms-2" href={href} rel={relTags}>
                    {site}
                  </a>
                ))}
            </div>
            {admin && n.community_id && (
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`news-main-${n.id}`}
                  checked={n.in_main}
                  onChange={() => this.setInMain(n, !n.in_main)}
                />
                <label
                  className="form-check-label"
                  htmlFor={`news-main-${n.id}`}
                >
                  Show in site news
                </label>
              </div>
            )}
          </div>
        ))}
      </section>
    );
  }
}
