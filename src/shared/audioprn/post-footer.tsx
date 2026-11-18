// audioprn: a creator's optional footer under each of their posts (on the post page): a
// disclaimer/blurb. Creators set it in Settings, next to their cash box (support links).
import { setIsoData, toast } from "@utils/app";
import { masonryUpdate } from "@utils/browser";
import { mdToHtml } from "@utils/markdown";
import { Component } from "inferno";
import { batchLoader } from "./batch-loader";
import { call } from "./creator-api";
import { getPostCredits } from "./post-credits";

interface Footer {
  person_id: number;
  blurb: string;
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
    const blurb = footers.get(this.props.creatorId)?.blurb;
    if (!blurb) return null;
    return (
      <div
        className="border-top small text-muted pt-2 my-2"
        style="white-space: pre-line"
      >
        {blurb}
      </div>
    );
  }
}

/** Recommended start of a cash box, shown in Settings while it's empty, which creators can
 * change (user, 2026-11-18). */
const CASH_BOX_START =
  "This is a full and free audio/script! If you would like to voluntarily support me, here's how:\n\n";

/** A creator's default cash box text (Settings), for the post form. */
export const defaultCashBox = (creatorId: number) =>
  getFooters([creatorId]).then(r => r.footers[0]?.support ?? "");

/** The creator's optional cash box (their support links), inside their Content posts at the
 * bottom: the post's own text if they changed it on the post form, else their default. */
export class CashBox extends Component<
  { creatorId: number; postId: number },
  { own?: string | null }
> {
  state: { own?: string | null } = {};
  private unsubscribe?: () => void;

  async componentDidMount() {
    this.unsubscribe = footers.subscribe(() => this.forceUpdate());
    footers.request(this.props.creatorId);
    const { cash_boxes } = await getPostCredits(this.props.postId).catch(
      () => ({ cash_boxes: [] }),
    );
    this.setState({ own: cash_boxes[0]?.text ?? null });
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    const { own } = this.state;
    if (own === undefined) return null;
    const support = own ?? footers.get(this.props.creatorId)?.support;
    if (!support) return null;
    return (
      <div className="col-12">
        <div className="cash-box bg-success-subtle text-success-emphasis border border-success-subtle rounded p-2 my-2">
          <div
            className="md-div"
            dangerouslySetInnerHTML={mdToHtml(support, () => {})}
          />
        </div>
      </div>
    );
  }
}

/** Settings: the creator's footer (blurb up to 500 characters) and cash box (up to 500
 * characters of markdown). */
export class CreatorFooterSettings extends Component<
  object,
  { blurb: string; support: string }
> {
  private isoData = setIsoData(this.context);
  state = { blurb: "", support: "" };

  async componentDidMount() {
    // The settings cards are laid out before this section appears: lay them out again.
    masonryUpdate("settings-grid");
    const me = this.isoData.myUserInfo?.local_user_view.person.id;
    if (!me) return;
    const [footer] = (await getFooters([me])).footers;
    this.setState({
      blurb: footer?.blurb ?? "",
      support: footer?.support || CASH_BOX_START,
    });
  }

  async save() {
    try {
      const footer = await call<Footer>("PUT", "/creator_footer", {
        blurb: this.state.blurb,
        // The cash box replaced the footer's social links.
        links: [],
        // The recommended text alone, with nothing added, is no cash box.
        support:
          this.state.support.trim() === CASH_BOX_START.trim()
            ? ""
            : this.state.support,
      });
      this.setState({
        blurb: footer.blurb,
        support: footer.support || CASH_BOX_START,
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
          <label className="small text-muted mb-1" htmlFor="creator-cash-box">
            Cash box: a pale green box inside your Content posts, at the bottom,
            with your text. It starts with our recommended wording: change it to
            whatever you like. Optional (left empty, or with only the
            recommended wording, there's no box).
          </label>
          <textarea
            id="creator-cash-box"
            className="form-control mb-2"
            rows={4}
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
