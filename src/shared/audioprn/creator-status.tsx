// audioprn: who may post. Verified creators, moderators and admins.
//
// The backend enforces this on every post. This module lets the website hide the
// "Create post" buttons and the post form from everyone else.
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, WithHead } from "@utils/app";
import { isBrowser } from "@utils/browser";
import { Component, InfernoNode } from "inferno";
import { Link, RouterContext } from "inferno-router";
import { MyUserInfo } from "lemmy-js-client";
import { getMyCreatorApplication } from "./creator-api";

/** none = never applied, pending/denied/approved = their application's state */
export type CreatorStatus = "none" | "pending" | "denied" | "approved";

let loadedFor: number | undefined; // person id the status belongs to
let status: CreatorStatus | undefined;
let inFlight: Promise<void> | undefined;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

/** Fetches the logged-in user's creator status once per login (browser only). */
export function loadCreatorStatus(myUserInfo: MyUserInfo | undefined) {
  const personId = myUserInfo?.local_user_view.person.id;
  if (
    !isBrowser() ||
    personId === undefined ||
    myUserInfo?.local_user_view.local_user.admin
  ) {
    return;
  }
  if (loadedFor === personId && (status !== undefined || inFlight)) {
    return;
  }
  loadedFor = personId;
  status = undefined;
  inFlight = getMyCreatorApplication()
    .then(res => {
      const app = res.creator_application;
      status = !app
        ? "none"
        : app.approved === true
          ? "approved"
          : app.approved === false
            ? "denied"
            : "pending";
    })
    .catch(() => {
      status = "none";
    })
    .finally(() => {
      inFlight = undefined;
      notify();
    });
}

/** Moderators of any community may post (the backend checks the exact community). */
export function isModerator(myUserInfo: MyUserInfo | undefined): boolean {
  return (myUserInfo?.moderates.length ?? 0) > 0;
}

/**
 * true = may post, false = may not, undefined = still checking.
 * Logged-out visitors and the server-side render get false/undefined, so post
 * buttons never flash up for people who can't use them.
 */
export function canPost(
  myUserInfo: MyUserInfo | undefined,
): boolean | undefined {
  const luv = myUserInfo?.local_user_view;
  if (!luv) return false;
  if (luv.local_user.admin || isModerator(myUserInfo)) return true;
  if (loadedFor !== luv.person.id || status === undefined) return undefined;
  return status === "approved";
}

export function creatorStatus(
  myUserInfo: MyUserInfo | undefined,
): CreatorStatus | undefined {
  return loadedFor === myUserInfo?.local_user_view.person.id
    ? status
    : undefined;
}

/** Re-renders a component whenever the creator status changes. */
export function subscribeCreatorStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

interface CreatorOnlyProps {
  children?: InfernoNode;
}

/** Renders its children only for verified creators, moderators and admins. */
export class CreatorOnly extends Component<CreatorOnlyProps, object> {
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
    return canPost(this.isoData.myUserInfo) ? this.props.children : null;
  }
}

/** /signup/creator for someone who is already logged in: where their creator status stands. */
export class CreatorSignupLoggedIn extends Component<
  WithHead & { myUserInfo: MyUserInfo },
  object
> {
  private unsubscribe?: () => void;

  componentDidMount() {
    this.unsubscribe = subscribeCreatorStatus(() => this.forceUpdate());
    loadCreatorStatus(this.props.myUserInfo);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: "Sign up as a creator - audioprn",
      context: this.context as RouterContext,
    });
    const { myUserInfo } = this.props;
    const name = myUserInfo.local_user_view.person.name;
    const s = myUserInfo.local_user_view.local_user.admin
      ? "approved"
      : creatorStatus(myUserInfo);
    return (
      <div className="container-lg" style="max-width: 40rem">
        <h1 className="h4 mb-3">Sign up as a creator</h1>
        {s === undefined && <p className="text-muted">Checking…</p>}
        {s === "approved" && (
          <>
            <p>
              You're already a verified creator, so you can post right away.
            </p>
            <p>
              <Link to="/create_post">Create a post</Link> ·{" "}
              <Link to={`/u/${name}`}>Your creator page</Link>
            </p>
          </>
        )}
        {s === "pending" && (
          <p>Your creator application is waiting for an admin to verify it.</p>
        )}
        {s === "denied" && <p>Your creator application wasn't approved.</p>}
        {s === "none" && (
          <p>
            You're logged in as {name}, a listener account. Applying to be a
            creator with an existing account isn't possible yet: please ask an
            admin.
          </p>
        )}
      </div>
    );
  }
}
