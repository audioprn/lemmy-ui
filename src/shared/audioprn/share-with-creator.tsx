// audioprn: "Share with Creator" at the bottom of Script Offer posts: a listener or creator
// recommends the script to up to three verified creators, each getting a private message.
// Creators who turned recommendations off (Settings → Recommendations) aren't sent any.
import { setIsoData, toast } from "@utils/app";
import { masonryUpdate } from "@utils/browser";
import { Component } from "inferno";
import { PostView } from "lemmy-js-client";
import { HttpService } from "@services/index";
import { call } from "./creator-api";
import { listCreators } from "./creators";
import { Popup } from "./accessibility";

const MAX_CREATORS = 3;

/** Settings card, only for verified creators: take recommendations or not (saved at once). */
export class RecommendationSettings extends Component<
  object,
  { on?: boolean }
> {
  private isoData = setIsoData(this.context);
  state: { on?: boolean } = {};

  async componentDidMount() {
    const me = this.isoData.myUserInfo?.local_user_view.person.id;
    if (!me) return;
    const [creator] = await listCreators(me).catch(() => []);
    if (creator) {
      this.setState({ on: creator.recommendations });
      await masonryUpdate("settings-grid");
    }
  }

  async setOn(on: boolean) {
    this.setState({ on });
    try {
      await call("PUT", "/creator_settings", { recommendations: on });
    } catch (e) {
      toast((e as Error).message, "danger");
      this.setState({ on: !on });
    }
  }

  render() {
    const { on } = this.state;
    if (on === undefined) return null;
    return (
      <div className="col-12 col-md-6">
        <div className="card mb-3">
          <div className="card-body">
            <h5 className="card-title">Recommendations</h5>
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="see-recommendations"
                checked={on}
                onChange={() => this.setOn(!on)}
              />
              <label className="form-check-label" htmlFor="see-recommendations">
                See posts recommended by users for you
              </label>
            </div>
            <div className="small text-muted mt-1">
              Script Offers that listeners send you with 🎙️ Share with Creator,
              as private messages.
            </div>
          </div>
        </div>
      </div>
    );
  }
}

interface State {
  open: boolean;
  names: string[];
  sending: boolean;
  results: string[];
}

export class ShareWithCreator extends Component<{ postView: PostView }, State> {
  private isoData = setIsoData(this.context);
  state: State = {
    open: false,
    names: Array<string>(MAX_CREATORS).fill(""),
    sending: false,
    results: [],
  };

  /** Sends the recommendation to one creator and says how it went. */
  async send(name: string): Promise<string> {
    const username = name.trim().replace(/^@|^u\//i, "");
    const person = await HttpService.client.getPersonDetails({ username });
    if (person.state !== "success") return `${username}: no such user.`;
    const id = person.data.person_view.person.id;
    const [creator] = await listCreators(id).catch(() => []);
    if (!creator) return `${username}: not a verified creator.`;
    if (!creator.recommendations) {
      return `${username}: isn't taking script recommendations.`;
    }
    const { post } = this.props.postView;
    const res = await HttpService.client.createPrivateMessage({
      recipient_id: id,
      // A link on this site (no address), so it opens wherever the creator reads it.
      content: `I think you'd love this script: [${post.name.replace(/[[\]]/g, "\\$&")}](/post/${post.id})`,
    });
    return res.state === "success"
      ? `${username}: sent.`
      : `${username}: couldn't send (they may not accept messages).`;
  }

  async sendAll() {
    const names = [
      ...new Set(this.state.names.map(n => n.trim()).filter(Boolean)),
    ];
    if (!names.length) return;
    this.setState({ sending: true, results: [] });
    const results: string[] = [];
    for (const name of names) {
      results.push(await this.send(name));
    }
    this.setState({
      sending: false,
      results,
      names: Array<string>(MAX_CREATORS).fill(""),
    });
  }

  render() {
    if (!this.isoData.myUserInfo) return null;
    const { open, names, sending, results } = this.state;
    const close = () => this.setState({ open: false, results: [] });
    return (
      <div className="mb-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => this.setState({ open: true })}
        >
          🎙️ Share with Creator
        </button>
        {open && (
          <Popup label="Share with Creator" onClose={close}>
            <form
              className="card w-100 my-4"
              style="max-width: 30rem"
              onSubmit={e => {
                e.preventDefault();
                void this.sendAll();
              }}
            >
              <div className="card-body">
                <div className="d-flex align-items-start gap-2 mb-2">
                  <p className="mb-0">
                    Love this script? Recommend it to a creator here!
                  </p>
                  <button
                    type="button"
                    className="btn-close ms-auto"
                    aria-label="Close"
                    onClick={close}
                  />
                </div>
                {names.map((name, i) => (
                  <input
                    className="form-control mb-2"
                    placeholder="Creator's username"
                    aria-label={`Creator ${i + 1} of ${MAX_CREATORS}`}
                    value={name}
                    onInput={e =>
                      this.setState({
                        names: names.map((n, j) =>
                          j === i ? e.target.value : n,
                        ),
                      })
                    }
                  />
                ))}
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={sending || !names.some(n => n.trim())}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
                {results.length > 0 && (
                  <ul className="small mt-2 mb-0">
                    {results.map(r => (
                      <li>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </form>
          </Popup>
        )}
      </div>
    );
  }
}
