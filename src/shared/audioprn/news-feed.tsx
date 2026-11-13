// audioprn: news flashes. Site news (admins) at the top of the Content and My audioprn left
// column; community news (the community's mods) on community pages, which admins can also show
// in the site news. Up to 300 characters, every link counts as 23 and shows shortened.
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

interface Props {
  /** A community page's news (its mods post it); without it, the site news. */
  communityId?: number;
}

export class NewsFeed extends Component<
  Props,
  { news: NewsFlash[]; draft: string }
> {
  private isoData = setIsoData(this.context);
  state = { news: [] as NewsFlash[], draft: "" };

  async componentDidMount() {
    const { communityId } = this.props;
    const res = await call<{ news: NewsFlash[] }>(
      "GET",
      communityId ? `/news?community_id=${communityId}` : "/news",
    ).catch(() => ({ news: [] }));
    this.setState({ news: res.news });
  }

  /** Admins post site news and manage all news; a community's mods its community news. */
  get canPost() {
    const { communityId } = this.props;
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
          📣 {this.props.communityId ? "Cummunity news" : "News"}
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
            {!this.props.communityId && n.community_title && (
              <div className="text-muted">{n.community_title}:</div>
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
