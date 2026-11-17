// audioprn: the Cummunities page's Cards view (two per row: small banner, name, short
// description, counts, Join), next to Lemmy's list. The choice is remembered in this browser.
import { CommunityLink } from "@components/community/community-link";
import { numToSI } from "@utils/helpers";
import { InfernoNode } from "inferno";
import { CommunityView, MyUserInfo } from "lemmy-js-client";

const VIEW_KEY = "audioprn_communities_view";

export function savedCommunityCards(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) !== "list";
  } catch {
    return true;
  }
}

function saveCommunityCards(cards: boolean) {
  try {
    localStorage.setItem(VIEW_KEY, cards ? "cards" : "list");
  } catch {
    // Not remembered, that's all.
  }
}

export function CommunityViewSwitch({
  cards,
  onChange,
}: {
  cards: boolean;
  onChange: (cards: boolean) => void;
}) {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="View">
      {[true, false].map(c => (
        <button
          type="button"
          className={`btn ${c === cards ? "btn-secondary" : "btn-outline-secondary"}`}
          aria-pressed={c === cards}
          onClick={() => {
            saveCommunityCards(c);
            onChange(c);
          }}
        >
          {c ? "Cards" : "List"}
        </button>
      ))}
    </div>
  );
}

export function CommunityCards({
  items,
  myUserInfo,
  subscribe,
}: {
  items: CommunityView[];
  myUserInfo: MyUserInfo | undefined;
  /** The Join button, as in the list. */
  subscribe: (cv: CommunityView) => InfernoNode;
}) {
  return (
    <div className="row row-cols-1 row-cols-md-2 g-3 mb-3">
      {items.map(cv => (
        <div className="col">
          <div className="card h-100">
            {cv.community.banner && (
              <img
                src={cv.community.banner}
                alt=""
                className="card-img-top object-fit-cover"
                style="height: 6rem"
              />
            )}
            <div className="card-body d-flex flex-column">
              <h2 className="h5 card-title">
                <CommunityLink
                  community={cv.community}
                  myUserInfo={myUserInfo}
                  muted={false}
                />
              </h2>
              {cv.community.summary && (
                <p className="card-text">{cv.community.summary}</p>
              )}
              <div className="d-flex align-items-center gap-3 mt-auto small text-muted">
                <span>
                  {numToSI(cv.community.subscribers)}{" "}
                  {cv.community.subscribers === 1 ? "member" : "members"}
                </span>
                <span>{numToSI(cv.community.posts)} posts</span>
                <span className="ms-auto">{subscribe(cv)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
