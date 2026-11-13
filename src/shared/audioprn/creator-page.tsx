// audioprn: creator page extras. The pinned post at the top (social links, terms of use,
// boundaries, masterlists), and the creator's private stats (only they see them).
import { setIsoData, toast } from "@utils/app";
import { relTags } from "@utils/config";
import { mdToHtml } from "@utils/markdown";
import { Component } from "inferno";
import { call } from "./creator-api";
import { shortLink } from "./news-feed";

interface Pin {
  social_links: string[];
  terms: string;
  boundaries: string;
  masterlists: string;
}

type Draft = Omit<Pin, "social_links"> & { social_links: string };

const SECTIONS = [
  { key: "terms", title: "Terms of use" },
  { key: "boundaries", title: "Boundaries" },
  { key: "masterlists", title: "Masterlists" },
] as const;

interface PinState {
  pin?: Pin | null;
  isCreator: boolean;
  draft?: Draft;
}

/** The pinned post at the top of a creator's page. The creator edits it there. */
export class CreatorPin extends Component<{ personId: number }, PinState> {
  private isoData = setIsoData(this.context);
  state: PinState = { isCreator: false };

  async componentDidMount() {
    const { pin, is_creator } = await call<{
      pin: Pin | null;
      is_creator: boolean;
    }>("GET", `/creator_pin?person_id=${this.props.personId}`).catch(() => ({
      pin: null,
      is_creator: false,
    }));
    this.setState({ pin, isCreator: is_creator });
  }

  get isMe() {
    return (
      this.isoData.myUserInfo?.local_user_view.person.id === this.props.personId
    );
  }

  edit() {
    const pin = this.state.pin;
    this.setState({
      draft: {
        social_links: pin?.social_links.join("\n") ?? "",
        terms: pin?.terms ?? "",
        boundaries: pin?.boundaries ?? "",
        masterlists: pin?.masterlists ?? "",
      },
    });
  }

  async save(draft: Draft) {
    try {
      const { pin } = await call<{ pin: Pin | null }>("PUT", "/creator_pin", {
        ...draft,
        social_links: draft.social_links.split("\n"),
      });
      this.setState({ pin, draft: undefined });
      toast("Pinned post saved.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    const { pin, isCreator, draft } = this.state;
    if (!pin && !(this.isMe && isCreator)) return null;
    return (
      <div className="card border-primary-subtle mb-3">
        <div className="card-body">
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="small text-muted">📌 Pinned</span>
            {this.isMe && !draft && (
              <button
                type="button"
                className="btn btn-link btn-sm p-0 ms-auto"
                onClick={() => this.edit()}
              >
                {pin ? "Edit pinned post" : "Add a pinned post"}
              </button>
            )}
          </div>
          {!pin && !draft && (
            <p className="small text-muted mb-0">
              Pin your social links, terms of use, boundaries and masterlists to
              the top of your page.
            </p>
          )}
          {pin && !draft && (
            <>
              {pin.social_links.length > 0 && (
                <>
                  <h2 className="h6">Social links</h2>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {pin.social_links.map(link => (
                      <a
                        className="btn btn-sm btn-light border-light-subtle"
                        href={link}
                        rel={relTags}
                        title={link}
                      >
                        {shortLink(link)}
                      </a>
                    ))}
                  </div>
                </>
              )}
              {SECTIONS.filter(s => pin[s.key]).map(s => (
                <>
                  <h2 className="h6">{s.title}</h2>
                  <div
                    className="md-div mb-3"
                    dangerouslySetInnerHTML={mdToHtml(pin[s.key], () => {})}
                  />
                </>
              ))}
            </>
          )}
          {draft && (
            <>
              <label className="form-label small" htmlFor="pin-social">
                Social links (one per line)
              </label>
              <textarea
                id="pin-social"
                className="form-control mb-2"
                rows={3}
                placeholder="https://patreon.com/you"
                value={draft.social_links}
                onInput={e =>
                  this.setState({
                    draft: { ...draft, social_links: e.target.value },
                  })
                }
              />
              {SECTIONS.map(s => (
                <>
                  <label className="form-label small" htmlFor={`pin-${s.key}`}>
                    {s.title} (Markdown works, e.g. [title](link))
                  </label>
                  <textarea
                    id={`pin-${s.key}`}
                    className="form-control mb-2"
                    rows={4}
                    value={draft[s.key]}
                    onInput={e =>
                      this.setState({
                        draft: { ...draft, [s.key]: e.target.value },
                      })
                    }
                  />
                </>
              ))}
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => this.save(draft)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle"
                  onClick={() => this.setState({ draft: undefined })}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
}

interface Stats {
  followers: number;
  posts: number;
  reactions: number;
  comments: number;
  awards: number;
}

const STATS: [keyof Stats, string][] = [
  ["followers", "Followers"],
  ["posts", "Posts"],
  ["reactions", "Reactions on your posts"],
  ["comments", "Comments on your posts"],
  ["awards", "Awards received"],
];

/** On the creator's own page: their totals. Only they see this. */
export class CreatorStats extends Component<object, { stats?: Stats | null }> {
  state: { stats?: Stats | null } = {};

  async componentDidMount() {
    const stats = await call<Stats | null>("GET", "/creator_stats").catch(
      () => null,
    );
    this.setState({ stats });
  }

  render() {
    const stats = this.state.stats;
    if (!stats) return null;
    return (
      <div className="card mb-3">
        <div className="card-body">
          <h2 className="h6">Your stats</h2>
          <ul className="list-unstyled small mb-1">
            {STATS.map(([key, label]) => (
              <li className="d-flex justify-content-between">
                <span>{label}</span>
                <strong>{stats[key]}</strong>
              </li>
            ))}
          </ul>
          <div className="small text-muted">Only you can see this.</div>
        </div>
      </div>
    );
  }
}
