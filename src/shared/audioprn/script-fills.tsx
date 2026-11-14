// audioprn: which Script Offer a fill is for (for fills: and userfills: in search). The filler
// can pick it on the post form; otherwise it's found from a link in the post to the Script
// Offer. A post shows "Fill of …", and a Script Offer how many fills it has.
import { Component } from "inferno";
import { Link } from "inferno-router";
import { call } from "./creator-api";

export interface ScriptFill {
  script_post_id: number | null;
  script_name: string | null;
  chosen: boolean;
  fills: number;
}

export const getScriptFill = (postId: number) =>
  call<ScriptFill>("GET", `/script_fill?post_id=${postId}`);

/** The post number from a link to a post here (or a plain number); undefined if neither. */
export function scriptPostId(text: string): number | undefined {
  const m = text.trim().match(/^(?:.*\/post\/)?(\d+)\/?(?:[?#].*)?$/);
  return m ? Number(m[1]) : undefined;
}

/** Saves the script picked on the form; an empty field clears the pick. */
export function saveScriptFill(postId: number, text: string) {
  const script = text.trim() ? scriptPostId(text) : null;
  if (script === undefined) {
    return Promise.reject(
      new Error("The script you filled should be a link to its post here."),
    );
  }
  return call<ScriptFill>("PUT", "/script_fill", {
    post_id: postId,
    script_post_id: script,
  });
}

/** Under an opened post: what it fills, or for a Script Offer, how many fills it has. */
export class FillLine extends Component<
  { postId: number; scriptOffer: boolean },
  { fill?: ScriptFill }
> {
  state: { fill?: ScriptFill } = {};

  async componentDidMount() {
    const fill = await getScriptFill(this.props.postId).catch(() => undefined);
    this.setState({ fill });
  }

  render() {
    const fill = this.state.fill;
    if (!fill) return null;
    if (this.props.scriptOffer) {
      return fill.fills > 0 ? (
        <div className="small text-muted my-1">
          🎙️ {fill.fills} fill{fill.fills === 1 ? "" : "s"}
        </div>
      ) : null;
    }
    return fill.script_post_id && fill.script_name ? (
      <div className="small text-muted my-1">
        📜 Fill of{" "}
        <Link to={`/post/${fill.script_post_id}`}>{fill.script_name}</Link>
      </div>
    ) : null;
  }
}
