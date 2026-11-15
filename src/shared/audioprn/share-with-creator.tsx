// audioprn: "Share with Creator" at the bottom of Script Offer posts: a listener or creator
// recommends the script to up to three verified creators, each getting a private message.
import { setIsoData } from "@utils/app";
import { Component } from "inferno";
import { PostView } from "lemmy-js-client";
import { HttpService } from "@services/index";
import { call } from "./creator-api";

const MAX_CREATORS = 3;

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
    names: Array(MAX_CREATORS).fill(""),
    sending: false,
    results: [],
  };

  /** Sends the recommendation to one creator and says how it went. */
  async send(name: string): Promise<string> {
    const username = name.trim().replace(/^@|^u\//i, "");
    const person = await HttpService.client.getPersonDetails({ username });
    if (person.state !== "success") return `${username}: no such user.`;
    const id = person.data.person_view.person.id;
    const { is_creator } = await call<{ is_creator: boolean }>(
      "GET",
      `/creator_pin?person_id=${id}`,
    ).catch(() => ({ is_creator: false }));
    if (!is_creator) return `${username}: not a verified creator.`;
    const { post } = this.props.postView;
    const res = await HttpService.client.createPrivateMessage({
      recipient_id: id,
      content: `I think you'd love this script: [${post.name.replace(/[[\]]/g, "\\$&")}](${location.origin}/post/${post.id})`,
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
      names: Array(MAX_CREATORS).fill(""),
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
          <div
            className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-start p-3 overflow-auto"
            style="background: rgba(0, 0, 0, 0.5); z-index: 1050"
            onClick={close}
          >
            <form
              className="card w-100 my-4"
              style="max-width: 30rem"
              role="dialog"
              aria-modal="true"
              aria-label="Share with Creator"
              onClick={e => e.stopPropagation()}
              onSubmit={e => {
                e.preventDefault();
                this.sendAll();
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
          </div>
        )}
      </div>
    );
  }
}
