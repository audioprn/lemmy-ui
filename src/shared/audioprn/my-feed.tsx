// audioprn: "My audioprn" (/my), each user's feed: posts from creators they follow (the past
// 7 days first), then Content posts that meet their tag preferences. It is the Content page
// (Home) with `filters` = MY_FEED; the backend decides what's in it (audioprn_my_feed in SQL).
import { setIsoData, toast } from "@utils/app";
import { Component, linkEvent } from "inferno";
import { Link } from "inferno-router";
import { GetPosts } from "lemmy-js-client";
import { WrappedLemmyHttp } from "../services/HttpService";
import { call } from "./creator-api";
import { contentFilters } from "./content-filters";

export const MY_FEED = "my";
/** My audioprn's saved posts (/my/saved). */
export const MY_SAVED = "my_saved";

/**
 * Posts for the Content page, or for My audioprn: its first page starts with followed creators'
 * posts from the past 7 days, then the rest of the feed (later pages are the rest only).
 */
export async function getFeedPosts(
  client: WrappedLemmyHttp,
  form: GetPosts,
  filters?: string,
) {
  const feed = (part: string, extra?: GetPosts) => {
    // Not in lemmy-js-client's types; sent like the other fields.
    const filter = { content_filters: `f_listener,m_listener,${part}` };
    return client.getPosts({ ...form, ...extra, ...filter });
  };
  if (filters === MY_SAVED) {
    return feed("saved");
  }
  if (filters !== MY_FEED) {
    return client.getPosts({ ...form, ...contentFilters(filters) });
  }
  const [recent, rest] = await Promise.all([
    form.page_cursor ? undefined : feed("my_recent", { limit: 50 }),
    feed("my_feed"),
  ]);
  if (recent?.state === "success" && rest.state === "success") {
    rest.data.items = [...recent.data.items, ...rest.data.items];
  }
  return rest;
}

interface Prefs {
  f_listener: boolean;
  m_listener: boolean;
  f_voices: boolean;
  m_voices: boolean;
  scripts: boolean;
  audios: boolean;
  favourite_tags: string[];
  excluded_tags: string[];
}

const CHECKBOXES: { name: keyof Prefs; label: string }[] = [
  { name: "f_listener", label: "Content for F listener" },
  { name: "m_listener", label: "Content for M listener" },
  { name: "f_voices", label: "F voices only" },
  { name: "m_voices", label: "M voices only" },
  { name: "scripts", label: "Scripts" },
  { name: "audios", label: "Audios" },
];

const tagsText = (tags: string[]) => tags.map(t => `[${t}]`).join(", ");
const textTags = (text: string) => text.split(",");

/** The left column of My audioprn: tag preferences, saved posts and own comments. */
export class MyFeedPrefs extends Component<
  { onSaved: () => void; saved?: boolean },
  { prefs?: Prefs; favourite: string; excluded: string; awards?: number }
> {
  private isoData = setIsoData(this.context);
  state = {
    prefs: undefined as Prefs | undefined,
    favourite: "",
    excluded: "",
    awards: undefined as number | undefined,
  };

  async componentDidMount() {
    if (!this.isoData.myUserInfo) return;
    const [prefs, awards] = await Promise.all([
      call<Prefs>("GET", "/feed_prefs"),
      call<{ weekly: boolean; monthly: number }>("GET", "/awards"),
    ]);
    this.setState({
      prefs,
      favourite: tagsText(prefs.favourite_tags),
      excluded: tagsText(prefs.excluded_tags),
      awards: (awards.weekly ? 1 : 0) + awards.monthly,
    });
  }

  async save(event: Event) {
    event.preventDefault();
    try {
      const prefs = await call<Prefs>("PUT", "/feed_prefs", {
        ...this.state.prefs,
        favourite_tags: textTags(this.state.favourite),
        excluded_tags: textTags(this.state.excluded),
      });
      this.setState({
        prefs,
        favourite: tagsText(prefs.favourite_tags),
        excluded: tagsText(prefs.excluded_tags),
      });
      toast("Saved.");
      this.props.onSaved();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    const { prefs, favourite, excluded } = this.state;
    const me = this.isoData.myUserInfo?.local_user_view.person.name;
    return (
      <div className="mb-3">
        <h1 className="h5">My audioprn{this.props.saved && ": saved posts"}</h1>
        <p className="small text-muted">
          New posts from creators you follow come first, then posts that match
          your tags.
        </p>
        {!me && (
          <p>
            <Link to="/login">Log in</Link> or <Link to="/signup">sign up</Link>{" "}
            to get your own feed.
          </p>
        )}
        {this.state.awards !== undefined && (
          <p
            className="small"
            title="One each week you post or comment; creators get 10 more each month after a month with Content posts. Unused awards don't carry over."
          >
            🏆 Awards to give: {this.state.awards}
          </p>
        )}
        {prefs && (
          <form onSubmit={e => this.save(e)}>
            {CHECKBOXES.map(({ name, label }) => (
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`my-${name}`}
                  checked={!!prefs[name]}
                  onChange={linkEvent(this, i =>
                    i.setState({ prefs: { ...prefs, [name]: !prefs[name] } }),
                  )}
                />
                <label className="form-check-label" htmlFor={`my-${name}`}>
                  {label}
                </label>
              </div>
            ))}
            <label className="form-label mt-2" htmlFor="my-favourite">
              Favourite tags (up to 10)
            </label>
            <input
              id="my-favourite"
              className="form-control"
              placeholder="[CNC], [Romance]"
              value={favourite}
              onInput={e => this.setState({ favourite: e.target.value })}
            />
            <label className="form-label mt-2" htmlFor="my-excluded">
              Never show tags
            </label>
            <input
              id="my-excluded"
              className="form-control"
              placeholder="[Gore], [Vore]"
              value={excluded}
              onInput={e => this.setState({ excluded: e.target.value })}
            />
            <button type="submit" className="btn btn-secondary mt-2">
              Save
            </button>
          </form>
        )}
        {me && (
          <ul className="list-unstyled mt-3">
            <li>
              {this.props.saved ? (
                <Link to="/my">My feed</Link>
              ) : (
                <Link to="/my/saved">🔖 Saved posts</Link>
              )}
            </li>
            <li>
              <Link to={`/u/${me}?contentType=comments`}>My comments</Link>
            </li>
          </ul>
        )}
      </div>
    );
  }
}

/** A creator removes (or restores) a comment on one of their own profile posts. */
export function removeProfileComment(commentId: number, removed: boolean) {
  return call("PUT", "/profile_comment/remove", {
    comment_id: commentId,
    removed,
  });
}
