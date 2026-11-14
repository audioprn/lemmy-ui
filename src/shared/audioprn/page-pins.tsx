// audioprn: up to 4 posts a creator pins on their page. They go first on the first page of the
// creator's posts, under the pinned links post, marked 📌. The creator pins them from the post's
// action row.
import { toast } from "@utils/app";
import { Component } from "inferno";
import { PagedResponse, Post, PostCommentCombinedView } from "lemmy-js-client";
import { HttpService } from "../services";
import { RequestState } from "../services/HttpService";
import { call } from "./creator-api";

interface PagePins {
  post_ids: number[];
  is_creator: boolean;
}

type Content = RequestState<PagedResponse<PostCommentCombinedView>>;

const getPins = (personId: number) =>
  call<PagePins>("GET", `/creator_page_pins?person_id=${personId}`);

const MARK = "audioprn_page_pin";

export const isPagePinned = (post: Post) => MARK in post;

/** The creator's pinned posts first (marked), then the rest of the list without them. */
export async function withPagePins(
  content: Content,
  personId: number,
): Promise<Content> {
  if (content.state !== "success") return content;
  const { post_ids } = await getPins(personId).catch(() => ({
    post_ids: [] as number[],
  }));
  if (post_ids.length === 0) return content;
  const pinned = (
    await Promise.all(post_ids.map(id => HttpService.client.getPost({ id })))
  ).flatMap(res =>
    res.state === "success"
      ? [
          {
            type_: "post" as const,
            ...res.data.post_view,
            post: { ...res.data.post_view.post, [MARK]: true },
          },
        ]
      : [],
  );
  const rest = content.data.items.filter(
    i => i.type_ !== "post" || !post_ids.includes(i.post.id),
  );
  return {
    ...content,
    data: { ...content.data, items: [...pinned, ...rest] },
  };
}

// The logged-in creator's own pins, loaded once per page load for all their post rows.
let mine: { personId: number; pins: Promise<PagePins> } | undefined;

interface ButtonProps {
  postId: number;
  /** The logged-in user, who wrote the post. */
  personId: number;
}

/** "Pin to my page" / "Unpin" on a verified creator's own post. */
export class PagePinButton extends Component<ButtonProps, { pins?: PagePins }> {
  state: { pins?: PagePins } = {};

  async componentDidMount() {
    if (mine?.personId !== this.props.personId) {
      mine = {
        personId: this.props.personId,
        pins: getPins(this.props.personId),
      };
    }
    this.setState({ pins: await mine.pins.catch(() => undefined) });
  }

  async toggle(pinned: boolean) {
    try {
      const pins = await call<PagePins>("PUT", "/creator_page_pin", {
        post_id: this.props.postId,
        pinned,
      });
      mine = { personId: this.props.personId, pins: Promise.resolve(pins) };
      this.setState({ pins });
      toast(pinned ? "Pinned to your page." : "Unpinned from your page.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    const pins = this.state.pins;
    if (!pins?.is_creator) return null;
    const pinned = pins.post_ids.includes(this.props.postId);
    return (
      <button
        type="button"
        className="btn btn-sm btn-light border-light-subtle py-0 ms-2"
        onClick={() => this.toggle(!pinned)}
      >
        {pinned ? "📌 Unpin" : "📌 Pin to my page"}
      </button>
    );
  }
}
