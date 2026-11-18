import { showAvatars, showMedia } from "@utils/app";
import { isBrowser } from "@utils/browser";
import { getStaticDir } from "@utils/env";
import { numToSI } from "@utils/helpers";
import {
  amAdmin,
  moderatesPrivateCommunity,
  moderatesSomething,
} from "@utils/roles";
import { Component, createRef } from "inferno";
import { NavLink } from "inferno-router";
import { GetSiteResponse, MyUserInfo } from "lemmy-js-client";
import {
  I18NextService,
  UserService,
  UnreadCounterService,
} from "../../services";
import { Icon } from "../common/icon";
import { PictrsImage } from "../common/pictrs-image";
import { Subscription } from "rxjs";
import { tippyMixin } from "../mixins/tippy-mixin";
import { RouterContext } from "inferno-router";
import { NoOptionI18nKeys } from "i18next";
import {
  SHOW_COMMUNITIES,
  SHOW_MULTI_COMMUNITIES,
  SITE_TITLE,
} from "../../audioprn/features";
import { OnlineNow } from "../../audioprn/online-now";

interface NavbarProps {
  siteRes?: GetSiteResponse;
  myUserInfo: MyUserInfo | undefined;
}

interface NavbarState {
  onSiteBanner?(url: string): unknown;
  unreadNotifsCount: number;
  unreadReportCount: number;
  unreadApplicationCount: number;
  unreadPendingFollowsCount: number;
}

@tippyMixin
export class Navbar extends Component<NavbarProps, NavbarState> {
  collapseButtonRef = createRef<HTMLButtonElement>();
  mobileMenuRef = createRef<HTMLDivElement>();
  unreadNotifsCountSubscription: Subscription;
  unreadReportCountSubscription: Subscription;
  unreadApplicationCountSubscription: Subscription;
  unreadPendingFollowsSubscription: Subscription;

  state: NavbarState = {
    unreadNotifsCount: 0,
    unreadReportCount: 0,
    unreadApplicationCount: 0,
    unreadPendingFollowsCount: 0,
  };

  componentWillMount() {
    // Subscribe to jwt changes
    if (isBrowser()) {
      // On the first load, check the unreads
      UnreadCounterService.Instance.configure(this.props.myUserInfo);
      this.unreadNotifsCountSubscription =
        UnreadCounterService.Instance.notificationCount.subscribe(
          unreadNotifsCount => this.setState({ unreadNotifsCount }),
        );
      this.unreadReportCountSubscription =
        UnreadCounterService.Instance.unreadReportCount.subscribe(
          unreadReportCount => this.setState({ unreadReportCount }),
        );
      if (moderatesSomething(this.props.myUserInfo)) {
        this.unreadApplicationCountSubscription =
          UnreadCounterService.Instance.unreadApplicationCount.subscribe(
            unreadApplicationCount => this.setState({ unreadApplicationCount }),
          );
      }
      if (moderatesPrivateCommunity(this.props.myUserInfo)) {
        this.unreadPendingFollowsSubscription =
          UnreadCounterService.Instance.pendingFollowCount.subscribe(
            unreadPendingFollows =>
              this.setState({
                unreadPendingFollowsCount: unreadPendingFollows,
              }),
          );
      }

      document.addEventListener("mouseup", this.outsideMenuClickHandler);
    }
  }

  outsideMenuClickHandler = (e: MouseEvent) => {
    if (!this.mobileMenuRef.current?.contains(e.target as Node | null)) {
      handleCollapseClick(this);
    }
  };

  componentWillUnmount() {
    document.removeEventListener("mouseup", this.outsideMenuClickHandler);
    this.unreadNotifsCountSubscription.unsubscribe();
    this.unreadReportCountSubscription.unsubscribe();
    if (moderatesSomething(this.props.myUserInfo)) {
      this.unreadApplicationCountSubscription.unsubscribe();
    }
    if (moderatesPrivateCommunity(this.props.myUserInfo)) {
      this.unreadPendingFollowsSubscription.unsubscribe();
    }
  }

  // TODO class active corresponding to current pages
  render() {
    const siteView = this.props.siteRes?.site_view;
    const person = this.props.myUserInfo?.local_user_view.person;
    const registrationClosed =
      siteView?.local_site.registration_mode === "closed";

    return (
      <div className="shadow-sm">
        {/* The mobile navbar */}
        <nav
          className="navbar navbar-expand-md navbar-light p-0 px-3 container-lg"
          id="navbar"
        >
          {/* audioprn: OnlineNow shows nothing here, it counts visitors on every page */}
          <div className="d-flex align-items-center" style="flex: 1 1 0;">
            <NavLink
              id="navTitle"
              to="/"
              title={siteView?.site.summary ?? siteView?.site.name}
              className="d-flex align-items-center navbar-brand me-md-3 fs-6"
              onMouseUp={() => handleCollapseClick(this)}
            >
              {siteView?.site.icon &&
                showAvatars(this.props.myUserInfo) &&
                showMedia(this.props.myUserInfo) && (
                  <PictrsImage src={siteView.site.icon} type="icon" />
                )}
              {/* audioprn: the logo (see-through, orange, so it reads in light and dark) */}
              <img
                src={`${getStaticDir()}/assets/images/audioprn-logo.svg`}
                alt={SITE_TITLE}
                height={32}
              />
            </NavLink>
            {/* audioprn: a search bar next to the logo searches the Content page; empty, it
                opens the search there, expanded (user, 2026-11-18) */}
            <form
              role="search"
              className="me-2"
              style="flex: 0 1 22rem; min-width: 8rem;"
              onSubmit={e => handleNavSearch(this, e)}
            >
              {/* White, so it stands out on the dark top bar (and the border on light themes) */}
              <input
                type="search"
                name="q"
                className="form-control form-control-sm bg-white text-dark border-secondary nav-search"
                style="height: 30px;"
                aria-label="Search the Content page"
                placeholder="Search audios and scripts"
              />
            </form>
            <OnlineNow />
          </div>
          {person && (
            <ul className="navbar-nav d-flex flex-row ms-auto d-md-none">
              {/* Always show the notif button on mobile, but hide the others if the counts are 0. */}
              <li id="navMessages" className="nav-item nav-item-icon">
                <NavLink
                  to="/notifications"
                  className="p-1 nav-link border-0 nav-messages"
                  title={unreadNotificationsCount(this.state.unreadNotifsCount)}
                  onMouseUp={() => handleCollapseClick(this)}
                >
                  <Icon icon="bell" />
                  {this.state.unreadNotifsCount > 0 && (
                    <span className="mx-1 badge rounded-pill text-bg-danger">
                      {numToSI(this.state.unreadNotifsCount)}
                    </span>
                  )}
                </NavLink>
              </li>
              {this.state.unreadReportCount > 0 &&
                moderatesSomething(this.props.myUserInfo) && (
                  <li className="nav-item nav-item-icon">
                    <NavLink
                      to="/reports"
                      className="p-1 nav-link border-0"
                      title={unreadReportsCount(this.state.unreadReportCount)}
                      onMouseUp={() => handleCollapseClick(this)}
                    >
                      <Icon icon="shield" />
                      <span className="mx-1 badge rounded-pill text-bg-danger">
                        {numToSI(this.state.unreadReportCount)}
                      </span>
                    </NavLink>
                  </li>
                )}
              {this.state.unreadApplicationCount > 0 &&
                amAdmin(this.props.myUserInfo) && (
                  <li className="nav-item nav-item-icon">
                    <NavLink
                      to="/registration_applications"
                      className="p-1 nav-link border-0"
                      title={unreadApplicationCount(
                        this.state.unreadApplicationCount,
                      )}
                      onMouseUp={() => handleCollapseClick(this)}
                    >
                      <Icon icon="clipboard" />
                      <span className="mx-1 badge rounded-pill text-bg-danger">
                        {numToSI(this.state.unreadApplicationCount)}
                      </span>
                    </NavLink>
                  </li>
                )}
              {this.state.unreadPendingFollowsCount > 0 &&
                moderatesPrivateCommunity(this.props.myUserInfo) && (
                  <li className="nav-item nav-item-icon">
                    <NavLink
                      to="/pending_follows"
                      className="p-1 nav-link border-0"
                      title={pendingPrivateCommunityFollowsCount(
                        this.state.unreadPendingFollowsCount,
                      )}
                      onMouseUp={() => handleCollapseClick(this)}
                    >
                      <Icon icon="lock" />
                      <span className="mx-1 badge rounded-pill text-bg-danger">
                        {numToSI(this.state.unreadPendingFollowsCount)}
                      </span>
                    </NavLink>
                  </li>
                )}
            </ul>
          )}
          {/* The wide-screen navbar */}
          <button
            className="navbar-toggler border-0 p-1"
            type="button"
            aria-label="menu"
            data-tippy-content={I18NextService.i18n.t("expand_here")}
            data-bs-toggle="collapse"
            data-bs-target="#navbarDropdown"
            aria-controls="navbarDropdown"
            aria-expanded="false"
            ref={this.collapseButtonRef}
          >
            <Icon icon="menu" />
          </button>
          <div
            className="collapse navbar-collapse my-2"
            id="navbarDropdown"
            ref={this.mobileMenuRef}
          >
            {/* audioprn: smaller title (fs-6 above), links on the right next to the icons */}
            <ul id="navbarLinks" className="ms-auto navbar-nav">
              <li className="nav-item">
                <NavLink
                  to="/content"
                  className="nav-link"
                  onMouseUp={() => handleCollapseClick(this)}
                >
                  Content
                </NavLink>
              </li>
              {SHOW_COMMUNITIES && (
                <>
                  <li className="nav-item">
                    <NavLink
                      to="/communities"
                      className="nav-link"
                      title={I18NextService.i18n.t("communities")}
                      onMouseUp={() => handleCollapseClick(this)}
                    >
                      {I18NextService.i18n.t("communities")}
                    </NavLink>
                  </li>
                  {SHOW_MULTI_COMMUNITIES && (
                    <li className="nav-item">
                      <NavLink
                        to="/multi_communities"
                        className="nav-link"
                        title={I18NextService.i18n.t("multi_communities")}
                        onMouseUp={() => handleCollapseClick(this)}
                      >
                        {I18NextService.i18n.t("multi_communities")}
                      </NavLink>
                    </li>
                  )}
                </>
              )}
              <li className="nav-item">
                <NavLink
                  to="/creators"
                  className="nav-link"
                  onMouseUp={() => handleCollapseClick(this)}
                >
                  Creators
                </NavLink>
              </li>
              {/* audioprn: the user's own feed (guests go to the login page) */}
              <li className="nav-item">
                <NavLink
                  to={this.props.myUserInfo ? "/my" : "/login"}
                  className="nav-link"
                  onMouseUp={() => handleCollapseClick(this)}
                >
                  My audioprn
                </NavLink>
              </li>
              {/* audioprn: no Support Lemmy heart (linked from the right column's "How we use AI") */}
            </ul>
            <ul id="navbarIcons" className="navbar-nav">
              {/* audioprn: no search icon: the Search button is next to the logo */}
              {person ? (
                <>
                  <li id="navMessages" className="nav-item">
                    <NavLink
                      className="nav-link d-inline-flex align-items-center d-md-inline-block"
                      to="/notifications"
                      title={unreadNotificationsCount(
                        this.state.unreadNotifsCount,
                      )}
                      onMouseUp={() => handleCollapseClick(this)}
                    >
                      <Icon icon="bell" />
                      <span className="badge rounded-pill text-bg-danger d-inline ms-1 d-md-none ms-md-0">
                        {unreadNotificationsCount(this.state.unreadNotifsCount)}
                      </span>
                      {this.state.unreadNotifsCount > 0 && (
                        <span className="mx-1 badge rounded-pill text-bg-danger">
                          {numToSI(this.state.unreadNotifsCount)}
                        </span>
                      )}
                    </NavLink>
                  </li>
                  {moderatesSomething(this.props.myUserInfo) &&
                    this.state.unreadReportCount > 0 && (
                      <li id="navModeration" className="nav-item">
                        <NavLink
                          className="nav-link d-inline-flex align-items-center d-md-inline-block"
                          to="/reports"
                          title={unreadReportsCount(
                            this.state.unreadReportCount,
                          )}
                          onMouseUp={() => handleCollapseClick(this)}
                        >
                          <Icon icon="shield" />
                          <span className="badge rounded-pill text-bg-danger d-inline ms-1 d-md-none ms-md-0">
                            {pendingPrivateCommunityFollowsCount(
                              this.state.unreadPendingFollowsCount,
                            )}
                          </span>
                          {this.state.unreadReportCount > 0 && (
                            <span className="mx-1 badge rounded-pill text-bg-danger">
                              {numToSI(this.state.unreadReportCount)}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    )}
                  {amAdmin(this.props.myUserInfo) &&
                    this.state.unreadApplicationCount > 0 && (
                      <li id="navApplications" className="nav-item">
                        <NavLink
                          to="/registration_applications"
                          className="nav-link d-inline-flex align-items-center d-md-inline-block"
                          title={unreadApplicationCount(
                            this.state.unreadApplicationCount,
                          )}
                          onMouseUp={() => handleCollapseClick(this)}
                        >
                          <Icon icon="clipboard" />
                          <span className="badge rounded-pill text-bg-danger d-inline ms-1 d-md-none ms-md-0">
                            {unreadApplicationCount(
                              this.state.unreadApplicationCount,
                            )}
                          </span>
                          {this.state.unreadApplicationCount > 0 && (
                            <span className="mx-1 badge rounded-pill text-bg-danger">
                              {numToSI(this.state.unreadApplicationCount)}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    )}
                  {moderatesPrivateCommunity(this.props.myUserInfo) &&
                    this.state.unreadPendingFollowsCount > 0 && (
                      <li id="navApplications" className="nav-item">
                        <NavLink
                          to="/pending_follows"
                          className="nav-link d-inline-flex align-items-center d-md-inline-block"
                          title={pendingPrivateCommunityFollowsCount(
                            this.state.unreadPendingFollowsCount,
                          )}
                          onMouseUp={() => handleCollapseClick(this)}
                        >
                          <Icon icon="lock" />
                          <span className="badge rounded-pill text-bg-danger d-inline ms-1 d-md-none ms-md-0">
                            {pendingPrivateCommunityFollowsCount(
                              this.state.unreadPendingFollowsCount,
                            )}
                          </span>
                          {this.state.unreadPendingFollowsCount > 0 && (
                            <span className="mx-1 badge rounded-pill text-bg-danger">
                              {numToSI(this.state.unreadPendingFollowsCount)}
                            </span>
                          )}
                        </NavLink>
                      </li>
                    )}
                  {person && (
                    <li id="dropdownUser" className="dropdown">
                      <button
                        type="button"
                        className="btn dropdown-toggle"
                        aria-expanded="false"
                        data-bs-toggle="dropdown"
                      >
                        {showAvatars(this.props.myUserInfo) &&
                          showMedia(this.props.myUserInfo) &&
                          person.avatar && (
                            <PictrsImage src={person.avatar} type="icon" />
                          )}
                        {person.display_name ?? person.name}
                      </button>
                      <ul
                        className="dropdown-menu dropdown-menu-end"
                        style={{ "min-width": "fit-content" }}
                      >
                        <MyNavLink
                          onClick={() => handleCollapseClick(this)}
                          to={`/u/${person.name}`}
                          icon="user"
                          label="profile"
                        />
                        <MyNavLink
                          onClick={() => handleCollapseClick(this)}
                          to="/settings"
                          icon="settings"
                          label="settings"
                        />
                        {moderatesSomething(this.props.myUserInfo) && (
                          <MyNavLink
                            onClick={() => handleCollapseClick(this)}
                            to="/reports"
                            icon="shield"
                            label="reports"
                          />
                        )}
                        {amAdmin(this.props.myUserInfo) && (
                          <MyNavLink
                            onClick={() => handleCollapseClick(this)}
                            to="/registration_applications"
                            icon="clipboard"
                            label="registration_applications"
                          />
                        )}
                        {/* audioprn: creator verification */}
                        {amAdmin(this.props.myUserInfo) && (
                          <li>
                            <NavLink
                              to="/creator_applications"
                              className="dropdown-item px-2"
                              title="Creator applications"
                              onClick={() => handleCollapseClick(this)}
                            >
                              <Icon icon="check" classes="me-1" />
                              Creator applications
                            </NavLink>
                          </li>
                        )}
                        {moderatesPrivateCommunity(this.props.myUserInfo) && (
                          <MyNavLink
                            onClick={() => handleCollapseClick(this)}
                            to="/pending_follows"
                            icon="lock"
                            label="community_pending_follows"
                          />
                        )}
                        <li>
                          <hr className="dropdown-divider" />
                        </li>
                        <li>
                          <button
                            className="dropdown-item btn btn-link px-2"
                            onClick={() => handleLogOut(this)}
                          >
                            <Icon icon="log-out" classes="me-1" />
                            {I18NextService.i18n.t("logout")}
                          </button>
                        </li>
                      </ul>
                    </li>
                  )}
                </>
              ) : (
                <>
                  <li className="nav-item">
                    <NavLink
                      to="/login"
                      className="nav-link"
                      title={I18NextService.i18n.t("login")}
                      onMouseUp={() => handleCollapseClick(this)}
                    >
                      {I18NextService.i18n.t("login")}
                    </NavLink>
                  </li>
                  {!registrationClosed && (
                    <li className="nav-item">
                      <NavLink
                        to="/signup"
                        className="nav-link"
                        title={I18NextService.i18n.t("sign_up")}
                        onMouseUp={() => handleCollapseClick(this)}
                      >
                        {I18NextService.i18n.t("sign_up")}
                      </NavLink>
                    </li>
                  )}
                </>
              )}
            </ul>
          </div>
        </nav>
        {/* audioprn: on phones the menu hides Sign up and Login, so logged-out visitors get
            them in a row under the top bar on every page (user, 2026-11-18) */}
        {!person && (
          <div className="d-flex d-md-none flex-wrap justify-content-center align-items-center gap-2 py-2 border-bottom">
            <NavLink className="btn btn-sm btn-primary" to="/signup/creator">
              Become a creator
            </NavLink>
            <NavLink className="btn btn-sm btn-primary" to="/signup">
              Sign up as a user
            </NavLink>
            <NavLink className="btn btn-sm btn-link" to="/login">
              Log in
            </NavLink>
          </div>
        )}
      </div>
    );
  }

  get currentLocation() {
    const context = this.context as RouterContext;
    return context.router.history.location.pathname;
  }
}

/** audioprn: the top bar's search: show the results on the Content page (empty: open its search). */
function handleNavSearch(i: Navbar, e: Event) {
  e.preventDefault();
  const input = (e.target as HTMLFormElement).elements.namedItem(
    "q",
  ) as HTMLInputElement;
  const q = input.value.trim();
  input.value = "";
  input.blur();
  (i.context as RouterContext).router.history.push(
    q ? `/content?q=${encodeURIComponent(q)}` : "/content#search",
  );
}

function handleCollapseClick(i: Navbar) {
  if (
    i.collapseButtonRef.current?.attributes &&
    i.collapseButtonRef.current?.attributes.getNamedItem("aria-expanded")
      ?.value === "true"
  ) {
    i.collapseButtonRef.current?.click();
  }
}

async function handleLogOut(i: Navbar) {
  await UserService.Instance.logout();
  handleCollapseClick(i);
}

interface MyNavLinkProps {
  onClick: () => void;
  to: string;
  icon: string;
  label: NoOptionI18nKeys;
}

function MyNavLink({ onClick, to, icon, label }: MyNavLinkProps) {
  return (
    <li>
      <NavLink
        to={to}
        className="dropdown-item px-2"
        title={I18NextService.i18n.t(label)}
        onClick={onClick}
      >
        <Icon icon={icon} classes="me-1" />
        {I18NextService.i18n.t(label)}
      </NavLink>
    </li>
  );
}

function unreadReportsCount(unreadReportCount: number) {
  return I18NextService.i18n.t("unread_reports", {
    count: Number(unreadReportCount),
    formattedCount: numToSI(unreadReportCount),
  });
}

function unreadApplicationCount(unreadApplicationCount: number) {
  return I18NextService.i18n.t("unread_registration_applications", {
    count: Number(unreadApplicationCount),
    formattedCount: numToSI(unreadApplicationCount),
  });
}

function pendingPrivateCommunityFollowsCount(
  unreadPendingFollowsCount: number,
) {
  return I18NextService.i18n.t("pending_private_community_follows", {
    count: Number(unreadPendingFollowsCount),
    formattedCount: numToSI(unreadPendingFollowsCount),
  });
}

function unreadNotificationsCount(unreadNotifsCount: number) {
  return I18NextService.i18n.t("unread_messages", {
    count: Number(unreadNotifsCount),
    formattedCount: numToSI(unreadNotifsCount),
  });
}
