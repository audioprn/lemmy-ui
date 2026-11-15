// audioprn: Reddit opt-outs. /takedown is the public takedown request form; /admin/opt_outs is
// where admins handle requests and keep the opt-out list. Adding a name removes the imported
// posts that mention it (u/name, reddit.com/user/name or a credit), and new posts can't mention
// it (masterlist entries are exempt).
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, toast, WithHead } from "@utils/app";
import { amAdmin } from "@utils/roles";
import { Component } from "inferno";
import { RouterContext } from "inferno-router";
import { MomentTime } from "@components/common/moment-time";
import { call } from "./creator-api";

const pageTitle = (
  self: { isoData: ReturnType<typeof setIsoData> },
  t: string,
) => `${t} - ${self.isoData.siteRes?.site_view.site.name ?? ""}`;

interface TakedownState {
  reddit_name: string;
  contact: string;
  message: string;
  sending: boolean;
  sent: boolean;
}

export class TakedownPage extends Component<WithHead, TakedownState> {
  isoData = setIsoData(this.context);
  state: TakedownState = {
    reddit_name: "",
    contact: "",
    message: "",
    sending: false,
    sent: false,
  };

  async send(event: Event) {
    event.preventDefault();
    this.setState({ sending: true });
    try {
      const { reddit_name, contact, message } = this.state;
      await call("POST", "/takedown_request", {
        reddit_name,
        contact,
        message,
      });
      this.setState({ sent: true });
    } catch (e) {
      toast((e as Error).message, "danger");
    }
    this.setState({ sending: false });
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: pageTitle(this, "Reddit takedown request"),
      context: this.context as RouterContext,
    });
    const { reddit_name, contact, message, sending, sent } = this.state;
    return (
      <div className="container-lg" style="max-width: 40rem">
        <h1 className="h4 mb-3">Reddit takedown request</h1>
        <p>
          Creators can import their posts from Reddit, and some of those posts
          mention other Reddit users. If you don't want to appear on audioprn,
          send us your Reddit username. Once an admin has confirmed it's you,
          every imported post that mentions your Reddit username is removed, and
          new posts can't mention it. Creators' masterlists linking only to the
          original Reddit post are exempt.
        </p>
        {sent ? (
          <div className="alert alert-success">
            Thank you. An admin will look at your request.
          </div>
        ) : (
          <form onSubmit={e => this.send(e)}>
            <label className="form-label" htmlFor="takedown-name">
              Your Reddit username
            </label>
            <input
              id="takedown-name"
              className="form-control mb-3"
              required
              maxLength={22}
              placeholder="u/yourname"
              value={reddit_name}
              onInput={e => this.setState({ reddit_name: e.target.value })}
            />
            <label className="form-label" htmlFor="takedown-contact">
              How can we reach you? (optional)
            </label>
            <input
              id="takedown-contact"
              className="form-control mb-1"
              maxLength={200}
              value={contact}
              onInput={e => this.setState({ contact: e.target.value })}
            />
            <div className="small text-muted mb-3">
              We may message your Reddit account to confirm it's you.
            </div>
            <label className="form-label" htmlFor="takedown-message">
              Anything else? (optional)
            </label>
            <textarea
              id="takedown-message"
              className="form-control mb-3"
              rows={4}
              maxLength={2000}
              value={message}
              onInput={e => this.setState({ message: e.target.value })}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending || !reddit_name.trim()}
            >
              Send request
            </button>
          </form>
        )}
      </div>
    );
  }
}

interface TakedownRequest {
  id: number;
  reddit_name: string;
  contact: string;
  message: string;
  published_at: string;
}

interface OptOut {
  id: number;
  reddit_name: string;
  posts_removed: number;
  published_at: string;
  admin_name: string | null;
}

interface AdminState {
  requests: TakedownRequest[];
  opt_outs: OptOut[];
  newName: string;
}

export class OptOutsAdmin extends Component<WithHead, AdminState> {
  isoData = setIsoData(this.context);
  state: AdminState = { requests: [], opt_outs: [], newName: "" };

  async componentDidMount() {
    if (amAdmin(this.isoData.myUserInfo)) await this.load();
  }

  async load() {
    this.setState(
      await call<{ requests: TakedownRequest[]; opt_outs: OptOut[] }>(
        "GET",
        "/opt_outs",
      ),
    );
  }

  async optOut(name: string) {
    const shown = name.trim().replace(/^\/?u\//i, "");
    if (
      !confirm(
        `Add u/${shown} to the opt-out list? Every imported post that mentions u/${shown} is removed (you can restore posts one by one), and new posts can't mention them.`,
      )
    ) {
      return;
    }
    try {
      const o = await call<OptOut>("POST", "/opt_out", { reddit_name: name });
      toast(
        `u/${o.reddit_name} opted out: ${o.posts_removed} imported post${o.posts_removed === 1 ? "" : "s"} removed so far.`,
      );
      this.setState({ newName: "" });
      await this.load();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  async remove(path: string, id: number, question: string) {
    if (!confirm(question)) return;
    try {
      await call("DELETE", path, { id });
      await this.load();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: pageTitle(this, "Reddit opt-outs"),
      context: this.context as RouterContext,
    });
    if (!amAdmin(this.isoData.myUserInfo)) {
      return <div className="container-lg">Only admins can see this page.</div>;
    }
    const { requests, opt_outs, newName } = this.state;
    return (
      <div className="container-lg" style="max-width: 48rem">
        <h1 className="h4 mb-3">Reddit opt-outs</h1>
        <p className="small text-muted">
          Opting a Reddit user out removes every imported Reddit post that
          mentions them (u/name, reddit.com/user/name, or a credit), and new
          posts, edits and credits can't mention them. Masterlist entries are
          exempt. Creator applications matching a name are flagged. Requests
          come from the <a href="/takedown">takedown form</a>.
        </p>

        <h2 className="h5 mt-4">Takedown requests</h2>
        {requests.length === 0 && <p className="text-muted">None open.</p>}
        {requests.map(r => (
          <div className="card mb-2">
            <div className="card-body py-2">
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <strong>u/{r.reddit_name}</strong>
                <span className="small text-muted">
                  <MomentTime published={r.published_at} showAgo />
                </span>
                {opt_outs.some(
                  o =>
                    o.reddit_name.toLowerCase() === r.reddit_name.toLowerCase(),
                ) && (
                  <span className="badge text-bg-secondary">
                    Already listed
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-danger ms-auto"
                  onClick={() => this.optOut(r.reddit_name)}
                >
                  Opt out
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() =>
                    this.remove(
                      "/takedown_request",
                      r.id,
                      `Dismiss the request for u/${r.reddit_name}?`,
                    )
                  }
                >
                  Dismiss
                </button>
              </div>
              {r.contact && (
                <div className="small mt-1">Contact: {r.contact}</div>
              )}
              {r.message && (
                <div className="small mt-1" style="white-space: pre-line">
                  {r.message}
                </div>
              )}
            </div>
          </div>
        ))}

        <h2 className="h5 mt-4">Opt-out list</h2>
        <form
          className="d-flex gap-2 mb-3"
          onSubmit={e => {
            e.preventDefault();
            void this.optOut(newName);
          }}
        >
          <input
            className="form-control"
            placeholder="u/redditname"
            aria-label="Reddit username to opt out"
            maxLength={22}
            value={newName}
            onInput={e => this.setState({ newName: e.target.value })}
          />
          <button
            type="submit"
            className="btn btn-danger text-nowrap"
            disabled={!newName.trim()}
          >
            Opt out
          </button>
        </form>
        {opt_outs.length === 0 && <p className="text-muted">Nobody yet.</p>}
        {opt_outs.length > 0 && (
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Reddit user</th>
                <th>Added</th>
                <th>Posts removed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {opt_outs.map(o => (
                <tr>
                  <td>u/{o.reddit_name}</td>
                  <td className="small">
                    <MomentTime published={o.published_at} showAgo />
                    {o.admin_name && ` by ${o.admin_name}`}
                  </td>
                  <td>{o.posts_removed}</td>
                  <td className="text-end">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() =>
                        this.remove(
                          "/opt_out",
                          o.id,
                          `Take u/${o.reddit_name} off the list? Posts can mention them again; removed posts stay removed.`,
                        )
                      }
                    >
                      Remove from list
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
}
