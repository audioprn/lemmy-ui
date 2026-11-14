// audioprn: the Creators page (verified creators, sorted Recently posted, Alphabetical or Random)
// and the Follow / "Post on my page" buttons on a creator's profile (their Creator page).
// Creator page posts go to the `creators` community, which Content doesn't show.
import { reportToast, setIsoData, toast, WithHead } from "@utils/app";
import { Component } from "inferno";
import { Link, RouterContext } from "inferno-router";
import { htmlTags } from "@components/common/html-tags";
import { Spinner } from "@components/common/icon";
import { MomentTime } from "@components/common/moment-time";
import { HttpService } from "../services";
import { call } from "./creator-api";

interface Creator {
  id: number;
  name: string;
  display_name: string | null;
  avatar: string | null;
  last_post_at: string | null;
  following: boolean;
  /** null when the creator hides it (they always see their own). */
  followers: number | null;
  hide_follower_count: boolean;
}

const followersText = (n: number) => `${n} follower${n === 1 ? "" : "s"}`;

const listCreators = (personId?: number) =>
  call<{ creators: Creator[] }>(
    "GET",
    `/creators${personId ? `?person_id=${personId}` : ""}`,
  ).then(r => r.creators);

const SORTS = {
  recent: "Recently posted",
  alpha: "Alphabetical",
  random: "Random",
};
type Sort = keyof typeof SORTS;

function sorted(creators: Creator[], sort: Sort): Creator[] {
  const name = (c: Creator) => (c.display_name ?? c.name).toLowerCase();
  if (sort === "alpha") {
    return [...creators].sort((a, b) => name(a).localeCompare(name(b)));
  }
  if (sort === "random") {
    return creators
      .map(c => ({ c, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(({ c }) => c);
  }
  // ISO dates sort as text; never posted goes last.
  return [...creators].sort((a, b) =>
    (b.last_post_at ?? "").localeCompare(a.last_post_at ?? ""),
  );
}

interface CreatorsState {
  creators?: Creator[];
  sort: Sort;
}

export class Creators extends Component<WithHead, CreatorsState> {
  private isoData = setIsoData(this.context);
  state: CreatorsState = { sort: "recent" };

  async componentDidMount() {
    const creators = await listCreators().catch(e => {
      toast(e.message, "danger");
      return [];
    });
    this.setState({ creators });
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Creators - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    const { creators, sort } = this.state;
    return (
      <div className="container-lg">
        <h1 className="h4 mb-3">Creators</h1>
        <div className="btn-group mb-3" role="group" aria-label="Sort">
          {(Object.keys(SORTS) as Sort[]).map(s => (
            <button
              type="button"
              className={`btn btn-sm ${s === sort ? "btn-secondary" : "btn-outline-secondary"}`}
              aria-pressed={s === sort}
              onClick={() =>
                this.setState({
                  sort: s,
                  creators: creators && sorted(creators, s),
                })
              }
            >
              {SORTS[s]}
            </button>
          ))}
        </div>
        {!creators ? (
          <Spinner large />
        ) : creators.length === 0 ? (
          <p>No creators yet.</p>
        ) : (
          <ul className="list-unstyled">
            {creators.map(c => (
              <li className="d-flex align-items-center gap-2 mb-2">
                {c.avatar && (
                  <img
                    src={c.avatar}
                    alt=""
                    width={32}
                    height={32}
                    className="rounded-circle object-fit-cover"
                  />
                )}
                <Link to={`/u/${c.name}`}>{c.display_name ?? c.name}</Link>
                <span className="small text-muted">
                  @{c.name}
                  {c.followers !== null && ` · ${followersText(c.followers)}`}
                  {c.last_post_at && (
                    <>
                      {" · last posted "}
                      <MomentTime published={c.last_post_at} showAgo />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}

/**
 * Lemmy has no person reports, so a creator report is filed against the `creators` community,
 * which only admins see. Shows whether it went through.
 */
export async function reportCreator(name: string, reason: string) {
  const res = await HttpService.client.getCommunity({ name: "creators" });
  if (res.state !== "success") {
    return toast("Couldn't send the report.", "danger");
  }
  reportToast(
    await HttpService.client.createCommunityReport({
      community_id: res.data.community_view.community.id,
      reason: `Creator @${name} (/u/${name}): ${reason.trim()}`,
    }),
  );
}

interface ActionsState {
  creator?: Creator;
  pageCommunityId?: number;
  followers?: { name: string; display_name: string | null }[];
}

/** On a verified creator's profile: Follow for others, "Post on my page" for themself. */
export class CreatorPageActions extends Component<
  { personId: number },
  ActionsState
> {
  private isoData = setIsoData(this.context);
  state: ActionsState = {};

  get isMe() {
    return (
      this.isoData.myUserInfo?.local_user_view.person.id === this.props.personId
    );
  }

  async componentDidMount() {
    const [creator] = await listCreators(this.props.personId).catch(() => []);
    this.setState({ creator });
    if (creator && this.isMe) {
      const res = await HttpService.client.getCommunity({ name: "creators" });
      if (res.state === "success") {
        this.setState({
          pageCommunityId: res.data.community_view.community.id,
        });
      }
    }
  }

  async toggleFollow(creator: Creator) {
    try {
      const { following } = await call<{ following: boolean }>(
        "PUT",
        "/creator_follow",
        { creator_id: creator.id, follow: !creator.following },
      );
      const followers =
        creator.followers === null
          ? null
          : creator.followers + (following ? 1 : -1);
      this.setState({ creator: { ...creator, following, followers } });
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  /** The creator's own follower names, loaded when they open the list. */
  async loadFollowers() {
    if (this.state.followers) return;
    const res = await call<{
      followers: { name: string; display_name: string | null }[];
    }>("GET", "/creator_followers");
    this.setState({ followers: res.followers });
  }

  async setHideCount(creator: Creator, hide: boolean) {
    await call("PUT", "/creator_settings", { hide_follower_count: hide });
    this.setState({ creator: { ...creator, hide_follower_count: hide } });
  }

  /** Only on the creator's own profile: who follows them, and the public count switch. */
  myFollowers(creator: Creator) {
    const { followers } = this.state;
    return (
      <details
        className="position-relative align-self-start me-2"
        onToggle={() => this.loadFollowers()}
      >
        <summary className="btn btn-light border-light-subtle">
          👥 {followersText(creator.followers ?? 0)}
        </summary>
        <div
          className="position-absolute bg-body border rounded shadow p-2 mt-1"
          style="z-index: 10; min-width: 16rem"
        >
          <div className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="show-follower-count"
              checked={!creator.hide_follower_count}
              onChange={() =>
                this.setHideCount(creator, !creator.hide_follower_count)
              }
            />
            <label className="form-check-label" htmlFor="show-follower-count">
              Show my follower count to others
            </label>
          </div>
          <div className="small text-muted mb-1">
            Only you can see who follows you.
          </div>
          {!followers ? (
            <Spinner />
          ) : followers.length === 0 ? (
            <div className="small">No followers yet.</div>
          ) : (
            <ul
              className="list-unstyled mb-0"
              style="max-height: 20rem; overflow: auto"
            >
              {followers.map(f => (
                <li>
                  <Link to={`/u/${f.name}`}>{f.display_name ?? f.name}</Link>{" "}
                  <span className="small text-muted">@{f.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    );
  }

  async report(creator: Creator) {
    const reason = window.prompt(`Why are you reporting @${creator.name}?`);
    if (reason?.trim()) await reportCreator(creator.name, reason);
  }

  render() {
    const { creator, pageCommunityId } = this.state;
    const classes = "d-flex align-self-start btn me-2";
    if (!creator) return null;
    if (this.isMe) {
      return (
        <>
          {this.myFollowers(creator)}
          {pageCommunityId && (
            <Link
              className={`${classes} btn-primary`}
              to={`/create_post?communityId=${pageCommunityId}`}
            >
              Post on my page
            </Link>
          )}
          <Link
            className={`${classes} btn-light border-light-subtle`}
            to="/masterlist/edit"
          >
            Edit my masterlist
          </Link>
        </>
      );
    }
    const loggedIn = !!this.isoData.myUserInfo;
    return (
      <>
        {creator.followers !== null && (
          <span className="align-self-center text-muted me-2">
            {followersText(creator.followers)}
          </span>
        )}
        <button
          type="button"
          className={`${classes} ${creator.following ? "btn-light border-light-subtle" : "btn-primary"}`}
          disabled={!loggedIn}
          title={loggedIn ? undefined : "Log in to follow"}
          onClick={() => this.toggleFollow(creator)}
        >
          {creator.following ? "Following" : "Follow"}
        </button>
        {loggedIn && (
          // Last in the profile's button row, after Send message and Block user.
          <button
            type="button"
            className={`${classes} btn-light border-light-subtle order-last`}
            onClick={() => this.report(creator)}
          >
            Report creator
          </button>
        )}
      </>
    );
  }
}

interface CreditedPost {
  id: number;
  name: string;
  creator_name: string;
  hidden: boolean;
}

/**
 * On a profile: other people's posts that credit this person as u/name. Shown by default; on
 * their own profile they can hide (or show again) each one.
 */
export class CreditedOn extends Component<
  { personId: number },
  { posts: CreditedPost[] }
> {
  private isoData = setIsoData(this.context);
  state = { posts: [] as CreditedPost[] };

  async componentDidMount() {
    const { posts } = await call<{ posts: CreditedPost[] }>(
      "GET",
      `/credited_posts?person_id=${this.props.personId}`,
    ).catch(() => ({ posts: [] }));
    this.setState({ posts });
  }

  async setHidden(post: CreditedPost, hidden: boolean) {
    await call("PUT", "/credited_posts/hide", { post_id: post.id, hidden });
    this.setState({
      posts: this.state.posts.map(p =>
        p.id === post.id ? { ...p, hidden } : p,
      ),
    });
  }

  render() {
    const { posts } = this.state;
    if (posts.length === 0) return null;
    const isMe =
      this.isoData.myUserInfo?.local_user_view.person.id ===
      this.props.personId;
    return (
      <div className="card mb-3">
        <div className="card-body">
          <h2 className="h5">Credited on</h2>
          <ul className="list-unstyled mb-0">
            {posts.map(p => (
              <li className={p.hidden ? "text-muted" : undefined}>
                <Link to={`/post/${p.id}`}>{p.name}</Link>{" "}
                <span className="small text-muted">by @{p.creator_name}</span>
                {isMe && (
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 ms-2 align-baseline"
                    onClick={() => this.setHidden(p, !p.hidden)}
                  >
                    {p.hidden ? "Show on my profile" : "Hide"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
}
