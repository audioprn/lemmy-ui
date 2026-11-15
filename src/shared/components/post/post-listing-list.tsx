import { ShowCrossPostsType } from "@utils/types";
import {
  CreatePostLike,
  Language,
  MyUserInfo,
  PostView,
} from "lemmy-js-client";
import { PostThumbnail } from "./post-thumbnail";
import { PostCreatedLine, PostName } from "./common";
import { CrossPosts } from "./cross-posts";
import { CommentsButton } from "./post-action-bar";
import { PostReactions } from "../../audioprn/post-reactions";
import { PostTools } from "../../audioprn/post-tools";

type Props = {
  postView: PostView;
  crossPosts: PostView[];
  allLanguages: Language[];
  showCommunity: boolean;
  hideImage: boolean;
  viewOnly: boolean;
  myUserInfo: MyUserInfo | undefined;
  showCrossPosts: ShowCrossPostsType;
  voteLoading: boolean;
  mutePersonName: boolean;
  muteCommunityName: boolean;
  hideAvatar: boolean;
  onPostVote: (form: CreatePostLike) => void;
  onScrollIntoCommentsClick: (e: MouseEvent) => void;
};

export function PostListingList({
  postView,
  crossPosts,
  allLanguages,
  showCommunity,
  hideImage,
  myUserInfo,
  showCrossPosts,
  onScrollIntoCommentsClick,
  mutePersonName,
  muteCommunityName,
  hideAvatar,
}: Props) {
  return (
    <div>
      <article className="row post-container">
        {/* audioprn: no vote arrows on posts (emoji reactions instead) */}
        <div className="col">
          <PostName post={postView.post} showBody="hidden" />
          <PostCreatedLine
            postView={postView}
            showCommunity={showCommunity}
            showPublishedTime
            showUrlLine={false} // audioprn: the link shows once the post is opened
            showPostBadges
            allLanguages={allLanguages}
            myUserInfo={myUserInfo}
            mutePersonName={mutePersonName}
            muteCommunityName={muteCommunityName}
            hideAvatar={hideAvatar}
          />
          <CommentsButton
            postView={postView}
            type_="text"
            onScrollIntoCommentsClick={onScrollIntoCommentsClick}
          />
          {/* audioprn: emoji reactions instead of votes, then Save and Share */}
          <div className="d-flex flex-wrap gap-2">
            <PostReactions postId={postView.post.id} />
            <PostTools postView={postView} />
          </div>
        </div>
        <div className="col-auto">
          <PostThumbnail
            postView={postView}
            hideImage={hideImage}
            myUserInfo={myUserInfo}
          />
        </div>
      </article>
      <CrossPosts
        crossPosts={crossPosts}
        type_={showCrossPosts}
        myUserInfo={myUserInfo}
      />
    </div>
  );
}
