import { Link } from "inferno-router";
import { I18NextService } from "../../../services";
import { Icon } from "../icon";
import { CrossPostParams } from "@utils/types";
import { InfernoNode } from "inferno";
import { getQueryString } from "@utils/helpers";
import { CommunityView, LocalSite, MyUserInfo } from "lemmy-js-client";
import { canCreateCommunity } from "@utils/roles";
import classNames from "classnames";
import { userNotLoggedInOrBanned } from "@utils/app";
import { CreatorOnly } from "../../../audioprn/creator-status";
import {
  SHOW_COMMUNITIES,
  SHOW_MULTI_COMMUNITIES,
} from "../../../audioprn/features";

export function CrossPostButton(props: CrossPostParams): InfernoNode {
  const label = I18NextService.i18n.t("cross_post");
  return (
    <Link
      className="btn btn-sm border-light-subtle d-flex align-items-center rounded-0 dropdown-item"
      to={{
        pathname: "/create_post",
        state: props,
      }}
      title={label}
      data-tippy-content={label}
      aria-label={label}
    >
      <Icon icon="copy" classes="me-2" inline />
      {label}
    </Link>
  );
}

type CreatePostButtonProps = {
  communityView?: CommunityView;
  myUserInfo: MyUserInfo | undefined;
};
export function CreatePostButton({
  communityView,
  myUserInfo,
}: CreatePostButtonProps) {
  // audioprn: blue, so it stands out at the top of the column
  const classes = classNames("btn btn-primary d-block w-100", {
    "no-click":
      communityView?.community.deleted ||
      communityView?.community.removed ||
      userNotLoggedInOrBanned(myUserInfo),
  });

  const link = communityView
    ? "/create_post" +
      getQueryString({ communityId: communityView.community.id.toString() })
    : "/create_post";

  // audioprn: only verified creators and admins see this button.
  return (
    <CreatorOnly>
      <Link className={classes} to={link}>
        {I18NextService.i18n.t("create_post")}
      </Link>
    </CreatorOnly>
  );
}

type CreateCommunityButtonProps = {
  localSite?: LocalSite;
  myUserInfo: MyUserInfo | undefined;
  blockButton: boolean;
};
export function CreateCommunityButton({
  localSite,
  myUserInfo,
  blockButton,
}: CreateCommunityButtonProps) {
  if (!SHOW_COMMUNITIES) {
    return null;
  }
  const classes = classNames({
    "no-click": !(localSite && canCreateCommunity(localSite, myUserInfo)),
    "btn btn-light border-light-subtle d-block w-100": blockButton,
    "btn btn-sm btn-light border-light-subtle": !blockButton,
  });

  return (
    <Link className={classes} to="/create_community">
      {I18NextService.i18n.t("create_community")}
    </Link>
  );
}

type CreateMultiCommunityButtonProps = {
  myUserInfo: MyUserInfo | undefined;
  blockButton: boolean;
};
export function CreateMultiCommunityButton({
  myUserInfo,
  blockButton,
}: CreateMultiCommunityButtonProps) {
  if (!SHOW_MULTI_COMMUNITIES) {
    return null;
  }
  const classes = classNames({
    "no-click": userNotLoggedInOrBanned(myUserInfo),
    "btn btn-light border-light-subtle d-block w-100": blockButton,
    "btn btn-sm btn-light border-light-subtle": !blockButton,
  });

  return (
    <Link className={classes} to="/create_multi_community">
      {I18NextService.i18n.t("create_multi_community")}
    </Link>
  );
}
