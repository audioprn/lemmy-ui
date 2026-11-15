// audioprn: a creator's optional footer under each of their posts (on the post page): a
// disclaimer/blurb and social links (Patreon, Throne, Bluesky…). Creators set it in Settings.
import { setIsoData, toast } from "@utils/app";
import { masonryUpdate } from "@utils/browser";
import { relTags } from "@utils/config";
import { mdToHtml } from "@utils/markdown";
import { Component } from "inferno";
import { batchLoader } from "./batch-loader";
import { call } from "./creator-api";
import { shortLink } from "./news-feed";

interface Footer {
  person_id: number;
  blurb: string;
  links: string[];
  support: string;
}

const getFooters = (ids: number[]) =>
  call<{ footers: Footer[] }>(
    "GET",
    `/creator_footers?person_ids=${ids.join(",")}`,
  );

const footers = batchLoader<Footer | null>(async ids => {
  const res = await getFooters(ids);
  return new Map(res.footers.map(f => [f.person_id, f]));
}, null);

export class PostFooter extends Component<{ creatorId: number }, object> {
  private unsubscribe?: () => void;

  componentDidMount() {
    this.unsubscribe = footers.subscribe(() => this.forceUpdate());
    footers.request(this.props.creatorId);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const footer = footers.get(this.props.creatorId);
    if (!footer?.blurb && !footer?.links.length) return null;
    return (
      <div className="border-top small text-muted pt-2 my-2">
        {footer.blurb && (
          <div style="white-space: pre-line">{footer.blurb}</div>
        )}
        {footer.links.length > 0 && (
          <div className="d-flex flex-wrap gap-3 mt-1">
            {footer.links.map(link => (
              <a href={link} rel={relTags} title={link}>
                {shortLink(link)}
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }
}

/** The creator's optional cash box (their support links), inside their Content posts at the bottom. */
export class CashBox extends PostFooter {
  render() {
    const support = footers.get(this.props.creatorId)?.support;
    if (!support) return null;
    return (
      <div className="col-12">
        <div className="bg-success-subtle text-success-emphasis border border-success-subtle rounded p-2 my-2">
          This is a full and free audio/script! If you would like to voluntarily
          support me, here's how:
          <div
            className="md-div"
            dangerouslySetInnerHTML={mdToHtml(support, () => {})}
          />
        </div>
      </div>
    );
  }
}

/** Settings: the creator's footer (blurb up to 500 characters, up to 10 links, one per line)
 * and cash box (up to 500 characters of markdown). */
export class CreatorFooterSettings extends Component<
  object,
  { blurb: string; links: string; support: string }
> {
  private isoData = setIsoData(this.context);
  state = { blurb: "", links: "", support: "" };

  async componentDidMount() {
    // The settings cards are laid out before this section appears: lay them out again.
    masonryUpdate("settings-grid");
    const me = this.isoData.myUserInfo?.local_user_view.person.id;
    if (!me) return;
    const [footer] = (await getFooters([me])).footers;
    if (footer) {
      this.setState({
        blurb: footer.blurb,
        links: footer.links.join("\n"),
        support: footer.support,
      });
    }
  }

  async save() {
    try {
      const footer = await call<Footer>("PUT", "/creator_footer", {
        blurb: this.state.blurb,
        links: this.state.links.split("\n"),
        support: this.state.support,
      });
      this.setState({
        blurb: footer.blurb,
        links: footer.links.join("\n"),
        support: footer.support,
      });
      footers.set(footer.person_id, footer);
      toast("Post footer and cash box saved.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    return (
      <div className="mb-3 row">
        <label className="col-sm-3 col-form-label" htmlFor="creator-footer">
          Post footer
        </label>
        <div className="col-sm-9">
          <div className="small text-muted mb-1">
            Shown at the bottom of each of your posts. Optional.
          </div>
          <textarea
            id="creator-footer"
            className="form-control mb-2"
            rows={3}
            maxLength={500}
            placeholder="Disclaimer or a few words about you"
            value={this.state.blurb}
            onInput={e => this.setState({ blurb: e.target.value })}
          />
          <textarea
            className="form-control mb-2"
            rows={3}
            aria-label="Social links, one per line"
            placeholder={
              "Social links, one per line (up to 10)\nhttps://patreon.com/…"
            }
            value={this.state.links}
            onInput={e => this.setState({ links: e.target.value })}
          />
          <label className="small text-muted mb-1" htmlFor="creator-cash-box">
            Cash box: a pale green box inside your Content posts, at the bottom:
            "This is a full and free audio/script! If you would like to
            voluntarily support me, here's how:" followed by your text. Optional
            (left empty, there's no box).
          </label>
          <textarea
            id="creator-cash-box"
            className="form-control mb-2"
            rows={2}
            maxLength={500}
            placeholder={
              "Your Throne, Ko-fi or Patreon links, e.g.\n[Ko-fi](https://ko-fi.com/…) · [Throne](https://throne.com/…)"
            }
            value={this.state.support}
            onInput={e => this.setState({ support: e.target.value })}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => this.save()}
          >
            Save post footer and cash box
          </button>
        </div>
      </div>
    );
  }
}
