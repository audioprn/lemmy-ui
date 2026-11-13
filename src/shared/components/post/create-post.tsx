import {
  communityToChoice,
  enableNsfw,
  filterCommunitySelection,
  setIsoData,
  WithHead,
} from "@utils/app";
import {
  bareRoutePush,
  getIdFromString,
  getQueryParams,
  getQueryString,
} from "@utils/helpers";
import {
  Choice,
  CrossPostParams,
  QueryParams,
  RouteDataResponse,
  StringBoolean,
} from "@utils/types";
import { InfernoNode, Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import {
  CommunityView,
  CreatePost as CreatePostI,
  GetCommunity,
  GetCommunityResponse,
  LemmyHttp,
  PagedResponse,
  PostResponse,
} from "lemmy-js-client";
import { InitialFetchRequest, PostFormParams } from "@utils/types";
import { FirstLoadService, I18NextService } from "@services/index";
import {
  EMPTY_REQUEST,
  HttpService,
  LOADING_REQUEST,
  RequestState,
  WrappedLemmyHttp,
  wrapClient,
} from "../../services/HttpService";
import { htmlTags } from "../common/html-tags";
import { PostForm } from "./post-form";
import { getHttpBaseInternal } from "../../utils/env";
import { IRoutePropsWithFetch } from "@utils/routes";
import { simpleScrollMixin } from "../mixins/scroll-mixin";

import { isBrowser } from "@utils/browser";
import { backendErrorPopup, errorPopup } from "../../audioprn/error-popup";
import { CommunitySidebar } from "@components/community/community-sidebar";
import { Icon, Spinner } from "@components/common/icon";
import {
  canPost,
  creatorStatus,
  loadCreatorStatus,
  subscribeCreatorStatus,
} from "../../audioprn/creator-status";
import { MAIN_COMMUNITY_NAME, SHOW_COMMUNITIES } from "../../audioprn/features";
import { removeLocalStorageMarkdown } from "@components/common/markdown-textarea";

export interface CreatePostProps {
  communityId?: number;
  url?: string;
  title?: string;
  body?: string;
  languageId?: number;
  nsfw?: StringBoolean;
  customThumbnailUrl?: string;
  altText?: string;
}

type CreatePostData = RouteDataResponse<{
  communityResponse?: GetCommunityResponse;
  initialCommunitiesRes: PagedResponse<CommunityView>;
}>;

export function getCreatePostQueryParams(source?: string): CreatePostProps {
  return getQueryParams<CreatePostProps>(
    {
      communityId: getIdFromString,
      url: (url?: string) => url,
      body: (body?: string) => body,
      languageId: getIdFromString,
      nsfw: (nsfw?: StringBoolean) => nsfw,
      customThumbnailUrl: (customThumbnailUrl?: string) => customThumbnailUrl,
      title: (title?: string) => title,
      altText: (altText?: string) => altText,
    },
    source,
  );
}

function fetchCommunitiesForOptions(client: WrappedLemmyHttp) {
  return client.listCommunities({
    limit: 30,
    sort: "active_monthly",
    type_: "all",
  });
}

function stringAsQueryParam(param?: string) {
  return (param?.length ?? 0) > 0 ? param : undefined;
}

interface CreatePostState {
  createPostRes: RequestState<PostResponse>;
  selectedCommunity?: CommunityView;
  selectedCommunityIsNsfw: boolean;
  initialCommunitiesRes: RequestState<PagedResponse<CommunityView>>;
  isIsomorphic: boolean;
  resetCounter: number; // resets PostForm when changed
  showSidebarMobile: boolean;
}

type CreatePostPathProps = Record<string, never>;
type CreatePostRouteProps = RouteComponentProps<CreatePostPathProps> &
  CreatePostProps &
  WithHead;
export type CreatePostFetchConfig = IRoutePropsWithFetch<
  CreatePostData,
  CreatePostPathProps,
  CreatePostProps
>;

@simpleScrollMixin
export class CreatePost extends Component<
  CreatePostRouteProps,
  CreatePostState
> {
  private isoData = setIsoData<CreatePostData>(this.context);
  state: CreatePostState = {
    createPostRes: EMPTY_REQUEST,
    initialCommunitiesRes: EMPTY_REQUEST,
    isIsomorphic: false,
    resetCounter: 0,
    selectedCommunityIsNsfw: false,
    showSidebarMobile: false,
  };

  constructor(props: CreatePostRouteProps, context: object) {
    super(props, context);

    // Only fetch the data if coming from another routeupdate
    if (FirstLoadService.isFirstLoad) {
      const { communityResponse: communityRes, initialCommunitiesRes } =
        this.isoData.routeData;

      this.state = {
        ...this.state,
        initialCommunitiesRes,
        isIsomorphic: true,
      };

      if (communityRes?.state === "success") {
        this.state = {
          ...this.state,
          selectedCommunity: communityRes.data?.community_view,
        };
      }
    }
  }

  async fetchCommunity({ communityId }: CreatePostProps) {
    // audioprn: while communities are hidden, posts always go to `main`.
    if (communityId || !SHOW_COMMUNITIES) {
      const res = await HttpService.client.getCommunity(
        communityId ? { id: communityId } : { name: MAIN_COMMUNITY_NAME },
      );
      if (res.state === "success") {
        this.setState({
          selectedCommunity: res.data.community_view,
          selectedCommunityIsNsfw: res.data.community_view.community.nsfw,
        });
      }
    }
  }

  // audioprn: only verified creators and admins get the form.
  private unsubscribeCreatorStatus?: () => void;

  componentDidMount() {
    this.unsubscribeCreatorStatus = subscribeCreatorStatus(() =>
      this.forceUpdate(),
    );
    loadCreatorStatus(this.isoData.myUserInfo);
  }

  componentWillUnmount() {
    this.unsubscribeCreatorStatus?.();
  }

  notACreator() {
    const myUserInfo = this.isoData.myUserInfo;
    const status = creatorStatus(myUserInfo);
    return (
      <div className="create-post container-lg">
        <div className="col-12 col-lg-6 offset-lg-2 mb-4">
          <h1 className="h4 mb-3">{I18NextService.i18n.t("create_post")}</h1>
          {!myUserInfo ? (
            <p>
              Only verified creators can post. <Link to="/login">Log in</Link>{" "}
              or <Link to="/signup/creator">sign up as a creator</Link>.
            </p>
          ) : status === "pending" ? (
            <p>
              Only verified creators can post. Your creator application is
              waiting for an admin to review it.
            </p>
          ) : status === "denied" ? (
            <p>
              Only verified creators can post. Your creator application wasn't
              approved. Contact an admin if you think this is a mistake.
            </p>
          ) : (
            <p>
              Only verified creators can post. You can still comment on posts
              and follow creators.
            </p>
          )}
        </div>
      </div>
    );
  }

  async componentWillMount() {
    // TODO test this
    if (!this.state.isIsomorphic && isBrowser()) {
      const { communityId } = this.props;

      const initialCommunitiesRes = await fetchCommunitiesForOptions(
        HttpService.client,
      );

      this.setState({
        initialCommunitiesRes,
      });

      if (
        communityId !== this.state.selectedCommunity?.community.id ||
        !SHOW_COMMUNITIES
      ) {
        await this.fetchCommunity({ communityId });
      } else if (!communityId) {
        this.setState({
          selectedCommunity: undefined,
        });
      }

      const locationState = this.props.history.location.state as
        CrossPostParams | undefined;
      if (locationState) {
        await this.updateUrl({
          title: locationState.name,
          url: locationState.url,
          body: locationState.body,
          altText: locationState.altText,
          nsfw: locationState.nsfw,
          languageId: locationState.languageId,
          customThumbnailUrl: locationState.customThumbnailUrl,
        });
        this.setState(s => ({ resetCounter: s.resetCounter + 1 }));
      }
    }
  }

  async componentWillReceiveProps(nextProps: CreatePostRouteProps) {
    if (bareRoutePush(this.props, nextProps)) {
      this.setState(s => ({ resetCounter: s.resetCounter + 1 }));
    }
    if (this.props.communityId !== nextProps.communityId) {
      await this.fetchCommunity(nextProps);
    }
  }

  get documentTitle(): string {
    return `${I18NextService.i18n.t("create_post")} - ${
      this.isoData.siteRes?.site_view.site.name
    }`;
  }

  render() {
    const {
      selectedCommunity,
      selectedCommunityIsNsfw,
      createPostRes,
      showSidebarMobile,
      resetCounter,
      initialCommunitiesRes,
    } = this.state;
    const {
      body,
      communityId,
      customThumbnailUrl,
      languageId,
      title,
      nsfw,
      url,
      altText,
    } = this.props;

    const params: PostFormParams = {
      name: title,
      url,
      body,
      // audioprn: fall back to `main` (loaded when there's no community in the URL).
      community_id: communityId ?? this.state.selectedCommunity?.community.id,
      custom_thumbnail: customThumbnailUrl,
      language_id: languageId,
      nsfw: nsfw === "true",
      alt_text: altText,
    };

    const { siteRes, myUserInfo, showAdultConsentModal } = this.isoData;

    // audioprn: not allowed to post: explain instead of showing the form.
    const allowed = canPost(myUserInfo);
    if (allowed === false) {
      return this.notACreator();
    }
    if (allowed === undefined) {
      return (
        <div className="text-center my-5">
          <Spinner large />
        </div>
      );
    }

    const selectedCommunityChoice = selectedCommunity
      ? communityToChoice(selectedCommunity)
      : undefined;

    htmlTags({
      head: this.props.head,
      title: this.documentTitle,
      context: this.context as RouterContext,
    });

    return (
      <div className="create-post container-lg" key={resetCounter}>
        <div className="row">
          <div id="createPostForm" className="col-12 col-lg-6 offset-lg-2 mb-4">
            <h1 className="h4 mb-4">{I18NextService.i18n.t("create_post")}</h1>
            {/* audioprn: creator page posts go to `creators`, not Content */}
            {selectedCommunity?.community.name === "creators" && (
              <p className="text-muted">
                This post goes on your creator page, not on Content.
              </p>
            )}
            <PostForm
              onCreate={(form, bypassNav, afterCreate) =>
                handlePostCreate(this, form, bypassNav, afterCreate)
              }
              creatorPage={selectedCommunity?.community.name === "creators"}
              params={params}
              enableNsfw={enableNsfw(siteRes)}
              showAdultConsentModal={showAdultConsentModal}
              allLanguages={siteRes?.all_languages}
              siteLanguages={siteRes?.discussion_languages}
              selectedCommunityChoice={selectedCommunityChoice}
              onSelectCommunity={form =>
                handleSelectedCommunityChange(this, form)
              }
              selectedCommunityTags={selectedCommunity?.tags}
              initialCommunities={
                initialCommunitiesRes.state === "success"
                  ? filterCommunitySelection(
                      initialCommunitiesRes.data.items,
                      myUserInfo,
                    )
                  : []
              }
              loading={createPostRes.state === "loading"}
              myUserInfo={myUserInfo}
              localSite={siteRes.site_view.local_site}
              admins={siteRes.admins}
              onBodyBlur={form => handleBodyBlur(this, form)}
              onLanguageChange={languageId =>
                handleLanguageChange(this, languageId)
              }
              onTitleBlur={form => handleTitleBlur(this, form)}
              onUrlBlur={form => handleUrlBlur(this, form)}
              onThumbnailUrlBlur={form => handleThumbnailUrlBlur(this, form)}
              onNsfwChange={form => handleNsfwChange(this, form)}
              onAltTextBlur={form => handleAltTextBlur(this, form)}
              onCopySuggestedTitle={(url, title) =>
                handleCopySuggestedTitle(this, url, title)
              }
              isNsfwCommunity={selectedCommunityIsNsfw}
            />
          </div>
          <div className="d-block d-md-none">
            <button
              className="btn btn-light border-light-subtle d-inline-block mb-2 me-3"
              onClick={() => handleShowSidebarMobile(this)}
            >
              {I18NextService.i18n.t("sidebar")}{" "}
              <Icon
                icon={showSidebarMobile ? `minus-square` : `plus-square`}
                classes="icon-inline"
              />
            </button>
            {showSidebarMobile && this.sidebar()}
          </div>
          <aside className="d-none d-md-block col-md-4 col-lg-3">
            {this.sidebar()}
          </aside>
        </div>
      </div>
    );
  }

  async updateUrl(props: Partial<CreatePostProps>) {
    const {
      body,
      communityId,
      customThumbnailUrl,
      languageId,
      nsfw,
      url,
      title,
      altText,
    } = {
      ...this.props,
      ...props,
    };

    const createPostQueryParams: QueryParams<CreatePostProps> = {
      body: stringAsQueryParam(body),
      communityId: communityId?.toString(),
      customThumbnailUrl: stringAsQueryParam(customThumbnailUrl),
      languageId: languageId?.toString(),
      title: stringAsQueryParam(title),
      nsfw,
      url: stringAsQueryParam(url),
      altText: stringAsQueryParam(altText),
    };

    this.props.history.replace({
      pathname: "/create_post",
      search: getQueryString(createPostQueryParams),
    });

    await this.fetchCommunity({ communityId });
  }

  static fetchInitialData = async ({
    headers,
    query: { communityId },
  }: InitialFetchRequest<
    CreatePostPathProps,
    CreatePostProps
  >): Promise<CreatePostData> => {
    const client = wrapClient(
      new LemmyHttp(getHttpBaseInternal(), { headers }),
    );
    const data: CreatePostData = {
      initialCommunitiesRes: await fetchCommunitiesForOptions(client),
      communityResponse: EMPTY_REQUEST,
    };

    if (communityId || !SHOW_COMMUNITIES) {
      const form: GetCommunity = communityId
        ? { id: communityId }
        : { name: MAIN_COMMUNITY_NAME };

      data.communityResponse = await client.getCommunity(form);
    }

    return data;
  };

  sidebar(): InfernoNode | void {
    const communityRes = this.isoData.routeData.communityResponse;
    const moderators =
      communityRes?.state === "success"
        ? (communityRes.data?.moderators ?? [])
        : [];

    if (this.state.selectedCommunity) {
      return (
        <CommunitySidebar
          communityView={this.state.selectedCommunity}
          moderators={moderators}
          admins={this.isoData.siteRes.admins}
          enableNsfw={enableNsfw(this.isoData.siteRes)}
          showIcon
          allLanguages={this.isoData.siteRes.all_languages}
          siteLanguages={this.isoData.siteRes.discussion_languages}
          myUserInfo={this.isoData.myUserInfo}
          hideButtons
          onFollow={() => {}}
          onBlock={() => {}}
          onEditNotifs={() => {}}
          onRemove={() => {}}
          onPurge={() => {}}
          removeLoading={false}
          purgeLoading={false}
          followLoading={false}
        />
      );
    }
  }
}

async function handleSelectedCommunityChange(i: CreatePost, choice: Choice) {
  await i.updateUrl({
    communityId: getIdFromString(choice?.value),
  });
}

async function handleTitleBlur(i: CreatePost, title: string) {
  await i.updateUrl({ title });
}

async function handleUrlBlur(i: CreatePost, url: string) {
  await i.updateUrl({ url });
}

async function handleBodyBlur(i: CreatePost, body: string) {
  await i.updateUrl({ body });
}

async function handleLanguageChange(
  i: CreatePost,
  languageId: number | undefined,
) {
  await i.updateUrl({ languageId });
}

async function handleNsfwChange(i: CreatePost, nsfw: StringBoolean) {
  await i.updateUrl({ nsfw });
}

async function handleThumbnailUrlBlur(
  i: CreatePost,
  customThumbnailUrl: string,
) {
  await i.updateUrl({ customThumbnailUrl });
}

async function handleAltTextBlur(i: CreatePost, altText: string) {
  await i.updateUrl({ altText });
}

async function handleCopySuggestedTitle(
  i: CreatePost,
  url: string,
  title: string,
) {
  await i.updateUrl({ url, title });
}

async function handlePostCreate(
  i: CreatePost,
  form: CreatePostI,
  bypassNavWarning: () => void,
  afterCreate: (postId: number) => Promise<void>,
) {
  i.setState({ createPostRes: LOADING_REQUEST });
  const res = await HttpService.client.createPost(form);
  i.setState({ createPostRes: res });

  if (res.state === "success") {
    const postId = res.data.post_view.post.id;
    // audioprn: save the credits and Content option now that the post exists.
    await afterCreate(postId).catch(e => errorPopup(e.message));
    bypassNavWarning();
    removeLocalStorageMarkdown();
    i.props.history.replace(`/post/${postId}`);
  } else if (res.state === "failed") {
    backendErrorPopup(res.err); // audioprn: a clear popup
  }
}

function handleShowSidebarMobile(i: CreatePost) {
  i.setState({ showSidebarMobile: !i.state.showSidebarMobile });
}
