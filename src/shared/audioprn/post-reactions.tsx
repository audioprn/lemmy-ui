// audioprn: the five emoji reactions under each post, instead of votes. Each user picks one;
// clicking it again removes it. Engagement (reactions + 5 × comments) is the "top" sort.
// Awards (several types) show on the credits line under the title.
import { myAuth, setIsoData, toast } from "@utils/app";
import { getBackendHostExternal } from "@utils/env";
import classNames from "classnames";
import { Component } from "inferno";
import { batchLoader } from "./batch-loader";
import { call } from "./creator-api";

const EMOJI = [
  { name: "fire", emoji: "🔥" },
  { name: "gem", emoji: "💎" },
  { name: "black_heart", emoji: "🖤" },
  { name: "pleading", emoji: "🥺" },
  { name: "droplets", emoji: "💦" },
];

interface Reactions {
  counts: Record<string, number>;
  mine?: string;
  /** Awards per type. */
  awards?: Record<string, number>;
  awarded?: boolean;
}

const api = () => `${getBackendHostExternal()}/api/v4/audioprn`;
const headers = (): Record<string, string> => {
  const auth = myAuth();
  return auth ? { Authorization: `Bearer ${auth}` } : {};
};

const reactions = batchLoader<Reactions>(
  async ids => {
    const res = await fetch(`${api()}/post_reactions?post_ids=${ids}`, {
      headers: headers(),
    });
    const json: { reactions: (Reactions & { post_id: number })[] } =
      await res.json();
    return new Map(json.reactions.map(r => [r.post_id, r]));
  },
  { counts: {} },
);

async function react(postId: number, emoji?: string) {
  const res = await fetch(`${api()}/post_reaction`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers() },
    body: JSON.stringify({ post_id: postId, emoji }),
  });
  if (!res.ok) throw new Error("Couldn't save your reaction.");
  reactions.set(postId, await res.json());
}

/** An award admins made: the built-in ones are emoji, new ones a picture. */
export interface AwardType {
  kind: string;
  name: string;
  emoji: string | null;
  image: string | null;
  /** Can't be given any more; ones already given still show. */
  hidden: boolean;
}

let awardTypes: AwardType[] = [];
let awardTypesLoad: Promise<void> | undefined;

/** The award types, fetched once per page load (or again after an admin changes them). */
export function loadAwardTypes(reload = false): Promise<void> {
  if (reload || !awardTypesLoad) {
    awardTypesLoad = call<{ award_types: AwardType[] }>("GET", "/award_types")
      .then(res => {
        awardTypes = res.award_types;
      })
      .catch(() => {});
  }
  return awardTypesLoad;
}

export function AwardIcon({ type }: { type: AwardType }) {
  return type.image ? (
    <img
      src={type.image}
      alt=""
      style="height: 1.2em; width: auto; vertical-align: -0.2em"
    />
  ) : (
    <>{type.emoji}</>
  );
}

// audioprn awards: one per person per post, and it can't be taken back.
async function award(postId: number, kind: string, label: string) {
  if (!confirm(`Give this post the ${label} award? It can't be taken back.`)) {
    return;
  }
  reactions.set(
    postId,
    await call<Reactions>("PUT", "/post_award", { post_id: postId, kind }),
  );
}

export class PostReactions extends Component<{ postId: number }, object> {
  private isoData = setIsoData(this.context);
  private unsubscribe?: () => void;

  componentDidMount() {
    this.unsubscribe = reactions.subscribe(() => this.forceUpdate());
    reactions.request(this.props.postId);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const { counts, mine } = reactions.get(this.props.postId);
    const loggedIn = !!this.isoData.myUserInfo;
    return (
      <div className="d-flex flex-wrap gap-1">
        {EMOJI.map(({ name, emoji }) => (
          <button
            type="button"
            className={classNames("btn btn-sm py-0 px-2", {
              "btn-primary": mine === name,
              "btn-light border-light-subtle": mine !== name,
            })}
            disabled={!loggedIn}
            title={loggedIn ? undefined : "Log in to react"}
            aria-pressed={mine === name}
            onClick={() =>
              react(this.props.postId, mine === name ? undefined : name).catch(
                e => toast(e.message, "danger"),
              )
            }
          >
            {emoji} {counts[name] ?? 0}
          </button>
        ))}
      </div>
    );
  }
}

/** On the credits line: the awards a post got, then a button to give one. */
export class PostAwards extends Component<
  { postId: number; creatorId: number },
  { picking: boolean }
> {
  private isoData = setIsoData(this.context);
  private unsubscribe?: () => void;
  state = { picking: false };

  componentDidMount() {
    this.unsubscribe = reactions.subscribe(() => this.forceUpdate());
    reactions.request(this.props.postId);
    loadAwardTypes().then(() => this.forceUpdate());
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const { awards = {}, awarded } = reactions.get(this.props.postId);
    const { picking } = this.state;
    const myId = this.isoData.myUserInfo?.local_user_view.person.id;
    const button = "btn btn-sm btn-light border-light-subtle py-0";
    return (
      <>
        {awardTypes
          .filter(a => awards[a.kind])
          .map(a => (
            <span
              className="badge text-bg-light border fw-normal"
              style="font-size: 1.05em"
              title={`${a.name} award`}
            >
              <AwardIcon type={a} /> {awards[a.kind]}
            </span>
          ))}
        {myId !== undefined &&
          myId !== this.props.creatorId &&
          !awarded &&
          !picking && (
            <button
              type="button"
              className={button}
              onClick={() => this.setState({ picking: true })}
            >
              🏆 Give award
            </button>
          )}
        {picking &&
          awardTypes
            .filter(a => !a.hidden)
            .map(a => (
              <button
                type="button"
                className={button}
                onClick={() => {
                  this.setState({ picking: false });
                  award(this.props.postId, a.kind, a.name).catch(e =>
                    toast(e.message, "danger"),
                  );
                }}
              >
                <AwardIcon type={a} /> {a.name}
              </button>
            ))}
        {picking && (
          <button
            type="button"
            className="btn btn-sm btn-link py-0"
            onClick={() => this.setState({ picking: false })}
          >
            Cancel
          </button>
        )}
      </>
    );
  }
}
