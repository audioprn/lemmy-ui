// audioprn: the landing page at `/`. Tagline and rules from the spec, then
// the Content and Creators buttons (new visitors: Become a creator / Sign up as a user). The post feed moved to `/content`.
import { setIsoData, WithHead } from "@utils/app";
import { Component } from "inferno";
import { Link, RouterContext } from "inferno-router";
import { htmlTags } from "@components/common/html-tags";
import {
  canPost,
  loadCreatorStatus,
  subscribeCreatorStatus,
} from "./creator-status";

export class Landing extends Component<WithHead, object> {
  private isoData = setIsoData(this.context);
  private unsubscribe?: () => void;

  componentDidMount() {
    this.unsubscribe = subscribeCreatorStatus(() => this.forceUpdate());
    loadCreatorStatus(this.isoData.myUserInfo);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: this.isoData.siteRes?.site_view.site.name ?? "",
      context: this.context as RouterContext,
    });

    return (
      <div className="container-lg py-5 text-center">
        <h1 className="h2 mb-3">
          Free Audio Porn for and by consenting humans 18+
        </h1>
        <p className="lead mb-4">
          Links to voiced and written fictional performance art:{" "}
          <strong>NO Minors, NO AI, NO Limits*</strong>
        </p>
        <p className="small text-muted mx-auto mb-5" style="max-width: 40rem">
          *Audios and scripts featuring fictional minors are not allowed. Do not
          post content that breaks laws in the United States of America. This
          includes incitement or encouragement to harm others or commit illegal
          acts, defamation, fraud, and true threats. Only verified users may
          post, any registered user may comment. All links must be to full and
          free audios and scripts.
        </p>
        {/* New visitors get the two signups (user, 2026-11-18); members, Content and Creators,
            plus Become a creator for those who can't post yet */}
        <div className="d-flex flex-wrap justify-content-center gap-3">
          {this.isoData.myUserInfo ? (
            <>
              <Link className="btn btn-lg btn-primary px-5" to="/content">
                Content
              </Link>
              <Link className="btn btn-lg btn-primary px-5" to="/creators">
                Creators
              </Link>
              {canPost(this.isoData.myUserInfo) === false && (
                <Link
                  className="btn btn-lg btn-primary px-5"
                  to="/signup/creator"
                >
                  Become a creator
                </Link>
              )}
            </>
          ) : (
            <>
              <Link
                className="btn btn-lg btn-primary px-5"
                to="/signup/creator"
              >
                Become a creator
              </Link>
              <Link className="btn btn-lg btn-primary px-5" to="/signup">
                Sign up as a user
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }
}
