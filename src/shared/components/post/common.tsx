import { Icon } from "@components/common/icon";
import { MomentTime } from "@components/common/moment-time";
import { UserBadges } from "@components/common/user-badges";
import { CommunityLink } from "@components/community/community-link";
import { SHOW_COMMUNITIES } from "../../audioprn/features";
import { PostCredits } from "../../audioprn/post-credits";
import { PersonListing } from "@components/person/person-listing";
import { I18NextService } from "@services/index";
import { linkTarget, setIsoData } from "@utils/app";
import { relTags, torrentHelpUrl } from "@utils/config";
import { formatRelativeDate } from "@utils/date";
import { httpFrontendUrl } from "@utils/env";
import { mdToHtmlInline } from "@utils/markdown";
import { isMagnetLink, extractMagnetLinkDownloadName } from "@utils/media";
import { Link } from "inferno-router";
import {
  Post,
  PostView,
  MyUserInfo,
  Language,
  CommunityTag as CommunityTagI,
} from "lemmy-js-client";
import { T } from "inferno-i18next-dess";
import { hostname } from "@utils/helpers";
import { ShowBodyType } from "@utils/types";
import { CommunityTag } from "@components/community/community-tag";
import { InfernoNode } from "inferno";
import { isPagePinned } from "../../audioprn/page-pins"; // audioprn

type PostNameProps = {
  post: Post;
  showBody: ShowBodyType;
};
export function PostName({ post, showBody }: PostNameProps) {
  const url = post.url;
  const name =
    showBody === "full" ? (
      <a
        className={
          !post.featured_community && !post.featured_local
            ? "text-body"
            : "link-primary"
        }
        href={url}
        title={url}
        rel={relTags}
        dangerouslySetInnerHTML={mdToHtmlInline(post.name)}
      ></a>
    ) : (
      <PostLink post={post} />
    );

  return (
    <>
      {/* audioprn: one h1 per page (the opened post); titles in feeds are h2, for screen readers */}
      {showBody === "full" ? (
        <h1 className="post-name h5 d-inline text-break">{name}</h1>
      ) : (
        // audioprn: smaller in feeds, so more posts fit on screen (user, 2026-11-18)
        <h2 className="post-name h6 d-inline text-break">{name}</h2>
      )}
      {/* audioprn: credits under the title */}
      <PostCredits postId={post.id} creatorId={post.creator_id} />
    </>
  );
}

type PostBadgesProps = {
  post: Post;
  tags: CommunityTagI[];
  allLanguages: Language[];
};
export function PostBadges({ post, tags, allLanguages }: PostBadgesProps) {
  return (
    <span className="mx-1">
      {tags.map(tag => (
        <span className="me-1">
          <CommunityTag tag={tag} useName={false} />
        </span>
      ))}
      {post.language_id !== 0 && (
        <span className="me-1 badge text-bg-light">
          {allLanguages.find(lang => lang.id === post.language_id)?.name}
        </span>
      )}{" "}
      {post.scheduled_publish_time_at && (
        <span className="me-1 badge text-bg-light">
          {I18NextService.i18n.t("publish_in_time", {
            time: formatRelativeDate(post.scheduled_publish_time_at, true),
          })}
        </span>
      )}
      {post.removed && (
        <small className="me-2 badge text-bg-light">
          {I18NextService.i18n.t("removed")}
        </small>
      )}
      {/* audioprn: deleted posts are hidden by their creator */}
      {post.deleted && (
        <small className="me-2 badge text-bg-light">🙈 Hidden</small>
      )}
      {post.locked && (
        <small
          className="unselectable pointer me-2 text-muted fst-italic"
          data-tippy-content={I18NextService.i18n.t("locked")}
        >
          <Icon icon="lock" classes="icon-inline text-danger" />
        </small>
      )}
      {/* audioprn: pinned on the creator's page */}
      {isPagePinned(post) && (
        <small className="me-2" title="Pinned on their page">
          📌
        </small>
      )}
      {post.featured_community && (
        <small
          className="unselectable pointer me-2 text-muted fst-italic"
          data-tippy-content={I18NextService.i18n.t("featured_in_community")}
          aria-label={I18NextService.i18n.t("featured_in_community")}
        >
          <Icon icon="pin" classes="icon-inline text-primary" />
        </small>
      )}
      {post.featured_local && (
        <small
          className="unselectable pointer me-2 text-muted fst-italic"
          data-tippy-content={I18NextService.i18n.t("featured_in_local")}
          aria-label={I18NextService.i18n.t("featured_in_local")}
        >
          <Icon icon="pin" classes="icon-inline text-secondary" />
        </small>
      )}
      {/* audioprn: no NSFW badge, the whole site is adult content. */}
    </span>
  );
}

type PostCreatedLineProps = {
  postView: PostView;
  showCommunity: boolean;
  showPublishedTime: boolean;
  showUrlLine: boolean;
  showPostBadges: boolean;
  mutePersonName: boolean;
  muteCommunityName: boolean;
  hideAvatar: boolean;
  allLanguages: Language[];
  myUserInfo: MyUserInfo | undefined;
};
export function PostCreatedLine({
  postView,
  showCommunity,
  showPublishedTime,
  showUrlLine,
  showPostBadges,
  mutePersonName,
  muteCommunityName,
  hideAvatar,
  allLanguages,
  myUserInfo,
}: PostCreatedLineProps) {
  return (
    <div className="small mb-1 mb-md-0">
      {/* audioprn: creator page posts just show their creator (no "Creator pages by") */}
      {SHOW_COMMUNITIES &&
        showCommunity &&
        postView.community.name !== "creators" && (
          <>
            <CommunityLink
              community={postView.community}
              myUserInfo={myUserInfo}
              muted={muteCommunityName}
            />
            <span className="mx-1 small text-muted">
              {I18NextService.i18n.t("by")}
            </span>
          </>
        )}
      <PersonListing
        person={postView.creator}
        banned={
          postView.creator_banned || postView.creator_banned_from_community
        }
        myUserInfo={myUserInfo}
        muted={mutePersonName}
        hideAvatar={hideAvatar}
      />
      <UserBadges
        classNames="ms-1"
        creator={postView.creator}
        isBanned={postView.creator_banned}
        isBannedFromCommunity={postView.creator_banned_from_community}
        myUserInfo={myUserInfo}
        personActions={postView.person_actions}
      />
      {showPostBadges && (
        <PostBadges
          post={postView.post}
          tags={postView.tags}
          allLanguages={allLanguages}
        />
      )}
      {showUrlLine && postView.post.url && (
        <UrlLine postView={postView} myUserInfo={myUserInfo} includeDot />
      )}
      {showPublishedTime && (
        <>
          {" · "}
          <PostPublishedTime post={postView.post} />
        </>
      )}
    </div>
  );
}

type PostPublishedTimeProps = {
  post: Post;
};
export function PostPublishedTime({ post }: PostPublishedTimeProps) {
  return (
    <MomentTime
      published={post.published_at}
      updated={post.updated_at}
      showAgo={false}
    />
  );
}

type PostLinkProps = {
  post: Post;
};
function PostLink({ post }: PostLinkProps) {
  const featured = post.featured_community || post.featured_local;

  return (
    <Link
      className={`d-inline ${featured ? "link-primary" : "text-body"}`}
      to={`/post/${post.id}`}
      title={I18NextService.i18n.t("comments")}
    >
      <span
        className="d-inline"
        dangerouslySetInnerHTML={withoutLinks(mdToHtmlInline(post.name))}
      />
    </Link>
  );
}

/** audioprn: links as plain text, for feeds (a post's links only open from the post itself). */
export function withoutLinks(html: { __html: string }) {
  return {
    __html: html.__html
      .replace(/<a\b[^>]*>/g, "<span>")
      .replace(/<\/a>/g, "</span>"),
  };
}

type UrlLineProps = {
  postView: PostView;
  myUserInfo: MyUserInfo | undefined;
  includeDot: boolean;
};
export function UrlLine(
  { postView, myUserInfo, includeDot }: UrlLineProps,
  context: object,
): InfernoNode | void {
  const post = postView.post;
  const url = post.url;

  if (url) {
    const localUrl =
      hostname(url) === hostname(httpFrontendUrl("", setIsoData(context)));
    // If its a torrent link, extract the download name
    const linkName = isMagnetLink(url)
      ? extractMagnetLinkDownloadName(url)
      : !localUrl
        ? hostname(url)
        : null;

    if (linkName) {
      return (
        url &&
        !localUrl && (
          <>
            {includeDot && " · "}
            <a
              className="fst-italic text-body link-opacity-75 link-opacity-100-hover overflow-wrap-anywhere"
              href={url}
              title={url}
              rel={relTags}
              target={linkTarget(myUserInfo)}
            >
              {linkName}
            </a>
          </>
        )
      );
    }
  }
}

export function TorrentHelp() {
  return (
    <div className="alert alert-info small my-2" role="alert">
      <Icon icon="info" classes="icon-inline me-2" />
      <T parent="span" i18nKey="torrent_help">
        #
        <a className="alert-link" rel={relTags} href={torrentHelpUrl}>
          #
        </a>
      </T>
    </div>
  );
}
