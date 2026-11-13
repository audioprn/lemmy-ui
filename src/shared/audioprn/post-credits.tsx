// audioprn: post credits (writer, editor, voice actor), shown under the title, followed by the
// post's awards.
// A credit is a username (u/name, linked) or a plain name.
import { myAuth } from "@utils/app";
import { getBackendHostExternal } from "@utils/env";
import { Component } from "inferno";
import { Link } from "inferno-router";
import { batchLoader } from "./batch-loader";
import { PostAwards } from "./post-reactions";

export const CREDIT_ROLES = [
  { role: "writer", emoji: "✍️", label: "Writers" },
  { role: "editor", emoji: "🎬", label: "Editors" },
  { role: "voice_actor", emoji: "🎙️", label: "Voice actors" },
] as const;

export type CreditRole = (typeof CREDIT_ROLES)[number]["role"];

export interface PostCredit {
  role: CreditRole;
  name: string;
}

const api = () => `${getBackendHostExternal()}/api/v4/audioprn/post_credits`;

const credits = batchLoader<PostCredit[]>(async ids => {
  const res = await fetch(`${api()}?post_ids=${ids.join(",")}`);
  const json: { credits: (PostCredit & { post_id: number })[] } =
    await res.json();
  const byPost = new Map<number, PostCredit[]>(ids.map(id => [id, []]));
  json.credits.forEach(c => byPost.get(c.post_id)?.push(c));
  return byPost;
}, []);

/** A post's credits, and whether it's kept off the Content page. */
export async function getPostCredits(
  postId: number,
): Promise<{ credits: PostCredit[]; off_content: number[] }> {
  const res = await fetch(`${api()}?post_ids=${postId}`);
  return res.json();
}

/** Replaces a post's credits (and sets off_content). Throws if the backend refuses. */
export async function savePostCredits(
  postId: number,
  list: PostCredit[],
  offContent?: boolean,
) {
  const res = await fetch(api(), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${myAuth()}`,
    },
    body: JSON.stringify({
      post_id: postId,
      credits: list,
      off_content: offContent,
    }),
  });
  if (!res.ok) throw new Error("Couldn't save the credits.");
  credits.set(postId, (await res.json()).credits);
}

/** "u/anna, Bo" -> [{role, name: "u/anna"}, {role, name: "Bo"}] */
export function parseCredits(role: CreditRole, text: string): PostCredit[] {
  return text
    .split(",")
    .map(name => name.trim())
    .filter(Boolean)
    .map(name => ({ role, name }));
}

export function creditsText(list: PostCredit[], role: CreditRole): string {
  return list
    .filter(c => c.role === role)
    .map(c => c.name)
    .join(", ");
}

function CreditName({ name }: { name: string }) {
  const user = /^u\/([A-Za-z0-9_]+)$/.exec(name);
  return user ? <Link to={`/u/${user[1]}`}>{name}</Link> : <>{name}</>;
}

export class PostCredits extends Component<
  { postId: number; creatorId: number },
  object
> {
  private unsubscribe?: () => void;

  componentDidMount() {
    this.unsubscribe = credits.subscribe(() => this.forceUpdate());
    credits.request(this.props.postId);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const list = credits.get(this.props.postId);
    return (
      <div className="small d-flex flex-wrap align-items-center gap-2 my-1">
        {list.map(c => (
          // Twice the usual badge size (0.75em), so credits stand out.
          <span
            className="badge text-bg-light border fw-normal"
            style="font-size: 1.5em"
          >
            {CREDIT_ROLES.find(r => r.role === c.role)?.emoji}{" "}
            <CreditName name={c.name} />
          </span>
        ))}
        <PostAwards
          postId={this.props.postId}
          creatorId={this.props.creatorId}
        />
      </div>
    );
  }
}
