import {
  communityToChoice,
  userNotLoggedInOrBanned,
  searchCommunities,
  filterCommunitySelection,
} from "@utils/app";
import {
  capitalizeFirstLetter,
  debounce,
  getIdFromString,
  getQueryString,
  validTitle,
  validURL,
} from "@utils/helpers";
import { isImage, isMedia } from "@utils/media";
import { Choice, StringBoolean } from "@utils/types";
import autosize from "autosize";
import {
  ClipboardEvent,
  Component,
  FormEvent,
  InfernoNode,
  createRef,
} from "inferno";
import { Prompt } from "inferno-router";
import {
  CommunityView,
  CreatePost,
  EditPost,
  GetSiteMetadataResponse,
  Language,
  LanguageId,
  LocalSite,
  MyUserInfo,
  PersonView,
  PostView,
  CommunityTag,
  CommunityTagId,
  UploadImageResponse,
  ModEditPost,
  PagedResponse,
  PostResponse,
} from "lemmy-js-client";
import { backendErrorPopup, errorPopup } from "../../audioprn/error-popup";
import {
  deleteDraft,
  getDraft,
  PostDrafts,
  saveDraft,
} from "../../audioprn/post-drafts";
import {
  archiveTodayUrl,
  ghostArchiveUrl,
  postMarkdownFieldCharacterLimit,
  relTags,
  webArchiveUrl,
} from "@utils/config";
import { PostFormParams } from "@utils/types";
import { I18NextService } from "../../services";
import {
  EMPTY_REQUEST,
  HttpService,
  LOADING_REQUEST,
  RequestState,
} from "../../services/HttpService";
import { toast } from "@utils/app";
import { RouterContext } from "inferno-router"; // audioprn
import { call } from "../../audioprn/creator-api"; // audioprn
import { Icon, Spinner } from "../common/icon";
import { LanguageSelect } from "../common/language-select";
import { MarkdownTextArea } from "../common/markdown-textarea";
import { PostListings } from "./post-listings";
import { isBrowser } from "@utils/browser";
import { isMagnetLink, extractMagnetLinkDownloadName } from "@utils/media";
import {
  getUnixTimeLemmy,
  getUnixTime,
  unixTimeToLocalDateStr,
} from "@utils/date";
import { communityTagName } from "@components/community/community-tag";
import { FilterChipSelect } from "@components/common/filter-chip-select";
import { PostName } from "./common";
import { NoOptionI18nKeys } from "i18next";
import {
  MAIN_COMMUNITY_NAME,
  SAPPHIC_COMMUNITY_NAME,
  SHOW_COMMUNITIES,
} from "../../audioprn/features";
import { RichTextEditor } from "../../audioprn/rich-text";
import { createPostPoll } from "../../audioprn/post-poll";
import {
  NO_SCRIPT,
  ScriptFields,
  ScriptInput,
  loadPostScript,
  savePostScript,
} from "../../audioprn/post-script";
import { amAdmin } from "@utils/roles";
import {
  CREDIT_ROLES,
  CreditRole,
  creditsText,
  getPostCredits,
  parseCredits,
  savePostCredits,
} from "../../audioprn/post-credits";
import { defaultCashBox } from "../../audioprn/post-footer";
import {
  getScriptFill,
  saveScriptFill,
  scriptPostId,
} from "../../audioprn/script-fills";

const MAX_POST_TITLE_LENGTH = 300; // audioprn: spec allows 300 characters

// audioprn: a new poll, ending a week from now (as a datetime-local value).
const NEW_POLL = { question: "", options: ["", ""] };
function inAWeek() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

interface PostFormProps {
  post_view?: PostView; // If a post is given, that means this is an edit
  crossPosts?: PostView[];
  allLanguages: Language[];
  siteLanguages: number[];
  params?: PostFormParams;
  enableNsfw: boolean;
  showAdultConsentModal: boolean;
  selectedCommunityChoice?: Choice;
  selectedCommunityTags?: CommunityTag[];
  isNsfwCommunity: boolean;
  initialCommunities?: CommunityView[];
  loading: boolean;
  myUserInfo: MyUserInfo | undefined;
  localSite: LocalSite;
  admins: PersonView[];
  onCancel?: () => void;
  onCreate?: (
    form: CreatePost,
    bypassNavWarning: () => void,
    // audioprn: saves credits and the Content option once the post exists
    afterCreate: (postId: number) => Promise<void>,
  ) => void;
  /** audioprn: posting to the creator's page (never on Content) */
  creatorPage?: boolean;
  /** audioprn: open this saved draft */
  draftId?: number;
  /** audioprn: posting to `main`, the Content page only (no cummunity) */
  contentPageOnly?: boolean;
  /** audioprn: the chosen cummunity's name, for a new post */
  selectedCommunityName?: string;
  // audioprn: the result, so a refused edit can show an error
  onEdit?: (
    form: EditPost,
    bypassNavWarning: () => void,
  ) => void | Promise<RequestState<PostResponse>>;
  onModEdit?: (form: ModEditPost, bypassNavWarning: () => void) => void;
  onSelectCommunity?: (choice: Choice) => void;
  onTitleBlur?: (title: string) => void;
  onUrlBlur?: (url: string) => void;
  onBodyBlur?: (body: string) => void;
  onLanguageChange?: (languageId?: number) => void;
  onNsfwChange?: (nsfw: StringBoolean) => void;
  onThumbnailUrlBlur?: (thumbnailUrl: string) => void;
  onAltTextBlur?: (altText: string) => void;
  onCopySuggestedTitle?: (url: string, title: string) => void;
}

interface PostFormState {
  form: {
    name?: string;
    url?: string;
    body?: string;
    nsfw?: boolean;
    language_id?: LanguageId;
    community_id?: number;
    honeypot?: string;
    custom_thumbnail?: string;
    alt_text?: string;
    tags?: CommunityTagId[];
    // Javascript treats this field as a string, that can't have timezone info.
    scheduled_publish_time_at?: string;
  };
  /** audioprn: comma-separated names per credit role */
  credits: Partial<Record<CreditRole, string>>;
  /** audioprn: keep the post off the Content page */
  offContent?: boolean;
  /** audioprn: sapphic, "No comments from men are welcome on this post" (also off Content) */
  noMen?: boolean;
  /** audioprn: the post's cash box text (starts as the creator's default from Settings) */
  cashBox?: string;
  /** audioprn: the post's credits were loaded, so saving an edit may replace them */
  creditsLoaded?: boolean;
  /** audioprn: rich text mode for the body */
  richText?: boolean;
  /** audioprn: an optional poll (creator page posts); `ends` is a datetime-local value */
  poll?: { question: string; options: string[]; ends: string };
  /** audioprn: the script on a Script Offer post, and as loaded when editing */
  script?: ScriptInput;
  scriptLoaded?: string;
  /** audioprn: a Script Fill's script (a link to its post here), and as loaded when editing */
  fillOf?: string;
  fillLoaded?: string;
  /** audioprn: the open draft, while its saved copy loads, and how often it was saved */
  draftId?: number;
  draftLoading?: boolean;
  draftSaves?: number;
  /** audioprn: show the cummunity picker instead of "Content page only" */
  pickCummunity?: boolean;
  suggestedPostsRes: RequestState<PagedResponse<PostView>>;
  metadataRes: RequestState<GetSiteMetadataResponse>;
  imageLoading: boolean;
  uploadedImage?: UploadImageResponse;
  communitySearchLoading: boolean;
  communitySearchOptions: Choice[];
  previewMode: boolean;
  bypassNavWarning: boolean;
}

type EditorType = "creator" | "mod_or_admin" | "none";

export class PostForm extends Component<PostFormProps, PostFormState> {
  state: PostFormState = {
    suggestedPostsRes: EMPTY_REQUEST,
    metadataRes: EMPTY_REQUEST,
    form: {},
    credits: {},
    richText: true, // audioprn: the body editor opens in Rich text (Markdown is the other tab)
    imageLoading: false,
    uploadedImage: undefined,
    communitySearchLoading: false,
    previewMode: false,
    communitySearchOptions: [],
    bypassNavWarning: false,
  };

  postTitleRef = createRef<HTMLTextAreaElement>();

  constructor(props: PostFormProps, context: object) {
    super(props, context);

    const { post_view, selectedCommunityChoice, params } = this.props;
    // Means its an edit
    if (post_view) {
      const unix = getUnixTime(post_view.post.scheduled_publish_time_at);
      const scheduled_publish_time_at = unixTimeToLocalDateStr(unix);
      this.state = {
        ...this.state,
        form: {
          body: post_view.post.body,
          name: post_view.post.name,
          community_id: post_view.community.id,
          url: post_view.post.url,
          nsfw: post_view.post.nsfw,
          language_id: post_view.post.language_id,
          custom_thumbnail: post_view.post.thumbnail_url,
          alt_text: post_view.post.alt_text,
          tags: post_view.tags.map(t => t.id),
          scheduled_publish_time_at,
        },
      };
    } else if (selectedCommunityChoice) {
      this.state = {
        ...this.state,
        form: {
          ...this.state.form,
          community_id: getIdFromString(selectedCommunityChoice.value),
        },
        communitySearchOptions: [selectedCommunityChoice].concat(
          (this.props.initialCommunities?.map(communityToChoice) ?? []).filter(
            option => option.value !== selectedCommunityChoice.value,
          ),
        ),
      };
    } else {
      this.state = {
        ...this.state,
        communitySearchOptions:
          this.props.initialCommunities?.map(communityToChoice) ?? [],
      };
    }

    if (params) {
      this.state = {
        ...this.state,
        form: {
          ...this.state.form,
          ...params,
        },
      };
    }
    // audioprn: the form shows once the draft has loaded (the editors read it when they appear)
    this.state.draftLoading = !!this.props.draftId;
  }

  async componentWillMount() {
    if (this.state.form.url && isBrowser()) {
      await fetchPageTitle(this);
    }
  }

  async componentDidMount() {
    if (this.postTitleRef.current) {
      autosize(this.postTitleRef.current);
    }
    if (this.props.draftId) {
      await loadDraft(this, this.props.draftId); // audioprn
    }
    // audioprn: a new post's cash box starts as the creator's default (a draft keeps its own).
    const me = this.props.myUserInfo?.local_user_view.person.id;
    if (!this.props.post_view && me && this.state.cashBox === undefined) {
      const cashBox = await defaultCashBox(me).catch(() => "");
      this.setState(s => ({ cashBox: s.cashBox ?? cashBox }));
    }
    // audioprn: load the post's credits when editing.
    const pv = this.props.post_view;
    if (pv) {
      const { credits, off_content, no_men, cash_boxes } = await getPostCredits(
        pv.post.id,
      );
      this.setState({
        credits: Object.fromEntries(
          CREDIT_ROLES.map(({ role }) => [role, creditsText(credits, role)]),
        ),
        offContent: off_content.includes(pv.post.id),
        noMen: no_men.includes(pv.post.id),
        cashBox:
          cash_boxes[0]?.text ??
          (await defaultCashBox(pv.creator.id).catch(() => "")),
        creditsLoaded: true,
      });
      const fill = await getScriptFill(pv.post.id).catch(() => undefined);
      const fillOf =
        fill?.chosen && fill.script_post_id
          ? `${location.origin}/post/${fill.script_post_id}`
          : "";
      this.setState({ fillOf, fillLoaded: fillOf });
      if (this.editorType === "creator") {
        const script = await loadPostScript(pv.post.id).catch(() => undefined);
        if (script) {
          this.setState({ script, scriptLoaded: JSON.stringify(script) });
        }
      }
    }
  }

  /** audioprn: every post needs exactly one flair (admins' mod posts are exempt). */
  get missingFlair(): boolean {
    return (
      !amAdmin(this.props.myUserInfo) &&
      !!this.props.selectedCommunityTags?.some(t => !t.deleted) &&
      this.state.form.tags?.length !== 1
    );
  }

  /** audioprn: a post in the sapphic cummunity (can welcome no comments from men). */
  get sapphic(): boolean {
    return (
      (this.props.post_view?.community.name ??
        this.props.selectedCommunityName) === SAPPHIC_COMMUNITY_NAME
    );
  }

  /** audioprn: the cash box text to save (creator page posts have none; unchanged if not loaded). */
  get cashBoxToSave(): string | undefined {
    const creatorPage =
      this.props.creatorPage ||
      this.props.post_view?.community.name === "creators";
    return creatorPage ? undefined : this.state.cashBox;
  }

  /** audioprn: what to save as no_men: only for sapphic posts. */
  get noMen(): boolean {
    return this.sapphic && !!this.state.noMen;
  }

  /** audioprn: credits inputs, below the title, and the Content page option. */
  creditsInputs() {
    const creatorPage =
      this.props.creatorPage ||
      this.props.post_view?.community.name === "creators";
    // Content page posts are always on the Content page.
    const contentPageOnly = this.props.post_view
      ? this.props.post_view.community.name === MAIN_COMMUNITY_NAME
      : this.props.contentPageOnly;
    return (
      <>
        {/* Creator page posts have no credits (user, 2026-11-18). */}
        {!creatorPage && (
          <div className="mb-3 row">
            <div className="col-sm-2 col-form-label">Credits</div>
            <div className="col-sm-10">
              {/* audioprn: a Script Offer is only by its writer (user, 2026-11-18) */}
              {CREDIT_ROLES.filter(
                ({ role }) => !this.scriptOffer || role === "writer",
              ).map(({ role, emoji, label }) => (
                <div className="input-group mb-2">
                  <span className="input-group-text">
                    {emoji} {label}
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="u/username or name, comma-separated"
                    aria-label={label}
                    value={this.state.credits[role] ?? ""}
                    onInput={e =>
                      this.setState(s => ({
                        credits: { ...s.credits, [role]: e.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {!creatorPage && !contentPageOnly && (
          <div className="mb-3 row">
            <div className="col-sm-10 offset-sm-2">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="post-on-content"
                  checked={!this.state.offContent && !this.noMen}
                  disabled={this.noMen}
                  onChange={() =>
                    this.setState(s => ({ offContent: !s.offContent }))
                  }
                />
                <label className="form-check-label" htmlFor="post-on-content">
                  Show on the Content page (untick to show it only in its
                  cummunity)
                </label>
              </div>
              {this.sapphic && (
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="post-no-men"
                    checked={!!this.state.noMen}
                    onChange={() => this.setState(s => ({ noMen: !s.noMen }))}
                  />
                  <label className="form-check-label" htmlFor="post-no-men">
                    No comments from men are welcome on this post (shows it only
                    in sapphic)
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
        {/* audioprn: the green cash box at the bottom of Content posts, editable per post */}
        {!creatorPage && this.state.cashBox !== undefined && (
          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label" htmlFor="post-cash-box">
              Cash box
            </label>
            <div className="col-sm-10">
              <textarea
                id="post-cash-box"
                className="form-control"
                rows={3}
                maxLength={500}
                value={this.state.cashBox}
                onInput={e => this.setState({ cashBox: e.target.value })}
              />
              <div className="small text-muted mt-1">
                Your support links, in a pale green box at the bottom of this
                post. It starts as your default from Settings; leave it empty
                for no box on this post.
              </div>
            </div>
          </div>
        )}
        {creatorPage && !this.props.post_view && this.pollInputs()}
        {/* audioprn: the script and fill terms on Script Offer posts (editing: once loaded) */}
        {this.scriptOffer &&
          (!this.props.post_view || this.state.scriptLoaded) && (
            <div className="mb-3 row">
              <div className="col-sm-2 col-form-label">Script</div>
              <div className="col-sm-10">
                <ScriptFields
                  value={this.state.script ?? NO_SCRIPT}
                  onChange={script => this.setState({ script })}
                />
                <div className="small text-muted mt-1">
                  Only logged-in members can read the script here.
                </div>
              </div>
            </div>
          )}
        {/* audioprn: the Script Offer a Script Fill is for (fills: in search) */}
        {this.scriptFill && (
          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label" htmlFor="post-fill-of">
              Script you filled
            </label>
            <div className="col-sm-10">
              <input
                id="post-fill-of"
                className="form-control"
                placeholder="Link to the Script Offer's post here (optional)"
                value={this.state.fillOf ?? ""}
                onInput={e => this.setState({ fillOf: e.target.value })}
              />
              <div className="small text-muted mt-1">
                Counts your fill for that script. Left empty, a link to the
                Script Offer in your post's text is used.
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /** audioprn: what's wrong with the post, shown as a popup when it's sent. */
  get formError(): string | undefined {
    if (!this.state.form.community_id) return "Choose a cummunity.";
    if (this.missingFlair) {
      return "Choose one flair for your post (e.g. Audio: OC or Script Offer).";
    }
    if (this.titleTagError) return this.titleTagError;
    const fillOf = this.state.fillOf?.trim();
    if (this.scriptFill && fillOf && scriptPostId(fillOf) === undefined) {
      return "The script you filled should be a link to its post here.";
    }
    if (this.pollIncomplete) {
      return "The poll needs a question, at least 2 options and an end date in the future.";
    }
    return undefined;
  }

  /**
   * audioprn: Content and community titles start with a gender tag ([F4M], [M4F4M], [TF4A]…:
   * F, M, A, TF, TM, NB joined by 4) and have at most 7 other [tags]. Creator page posts are exempt;
   * admins need no gender tag but keep the limit (user, 2026-11-18). The backend checks the same.
   */
  get titleTagError(): string | undefined {
    if (
      this.props.creatorPage ||
      this.props.post_view?.community.name === "creators"
    ) {
      return undefined;
    }
    const title = (this.state.form.name ?? "").trimStart();
    const gender = /^\[((TF|TM|NB|F|M|A)+4)+(TF|TM|NB|F|M|A)+\]$/i;
    const tags = title.match(/\[[^[\]]{1,40}\]/g) ?? [];
    const first = tags[0] ?? "";
    if (
      !amAdmin(this.props.myUserInfo) &&
      (!first || !title.startsWith(first) || !gender.test(first))
    ) {
      return "Start the title with a gender tag like [F4M], [M4F] or [F4A].";
    }
    if (tags.filter(t => !gender.test(t)).length > 7) {
      return "Use at most 7 [tags] in the title, not counting gender tags.";
    }
    return undefined;
  }

  /** audioprn: the Script Offer flair is chosen. */
  get scriptOffer(): boolean {
    return this.flairChosen("script_offer");
  }

  /** audioprn: the Script Fill flair is chosen. */
  get scriptFill(): boolean {
    return this.flairChosen("script_fill");
  }

  flairChosen(name: string): boolean {
    return !!this.state.form.tags?.some(
      id =>
        this.props.selectedCommunityTags?.find(t => t.id === id)?.name === name,
    );
  }

  /** audioprn: a poll needs a question, 2 options and an end date in the future. */
  get pollIncomplete(): boolean {
    const poll = this.state.poll;
    return (
      !!poll &&
      (!poll.question.trim() ||
        poll.options.filter(o => o.trim()).length < 2 ||
        !(new Date(poll.ends) > new Date()))
    );
  }

  /** audioprn: an optional poll on creator page posts (added when the post is created). */
  pollInputs() {
    const poll = this.state.poll;
    const setPoll = (change: Partial<NonNullable<PostFormState["poll"]>>) =>
      this.setState(s => ({ poll: s.poll && { ...s.poll, ...change } }));
    return (
      <div className="mb-3 row">
        <div className="col-sm-2 col-form-label">Poll</div>
        <div className="col-sm-10">
          <div className="form-check mb-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="post-add-poll"
              checked={!!poll}
              onChange={() =>
                this.setState({
                  poll: poll ? undefined : { ...NEW_POLL, ends: inAWeek() },
                })
              }
            />
            <label className="form-check-label" htmlFor="post-add-poll">
              Add a poll (one choice per vote, votes can't be changed)
            </label>
          </div>
          {poll && (
            <>
              <input
                className="form-control mb-2"
                placeholder="Question"
                aria-label="Poll question"
                maxLength={200}
                value={poll.question}
                onInput={e => setPoll({ question: e.target.value })}
              />
              {poll.options.map((option, i) => (
                <input
                  className="form-control mb-2"
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Poll option ${i + 1}`}
                  maxLength={100}
                  value={option}
                  onInput={e =>
                    setPoll({
                      options: poll.options.map((o, j) =>
                        j === i ? e.target.value : o,
                      ),
                    })
                  }
                />
              ))}
              {poll.options.length < 6 && (
                <button
                  type="button"
                  className="btn btn-sm btn-light border-light-subtle mb-2"
                  onClick={() => setPoll({ options: [...poll.options, ""] })}
                >
                  Add option
                </button>
              )}
              <label className="form-label d-block" htmlFor="post-poll-ends">
                Poll ends
              </label>
              <input
                type="datetime-local"
                className="form-control"
                id="post-poll-ends"
                value={poll.ends}
                onInput={e => setPoll({ ends: e.target.value })}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  componentWillReceiveProps(
    nextProps: Readonly<{ children?: InfernoNode } & PostFormProps>,
  ) {
    if (
      this.props.selectedCommunityChoice?.value !==
        nextProps.selectedCommunityChoice?.value &&
      nextProps.selectedCommunityChoice
    ) {
      this.setState(
        s => (
          (s.form.community_id = getIdFromString(
            nextProps.selectedCommunityChoice?.value,
          )),
          s
        ),
      );
      this.setState({
        communitySearchOptions: [nextProps.selectedCommunityChoice].concat(
          (nextProps.initialCommunities?.map(communityToChoice) ?? []).filter(
            option => option.value !== nextProps.selectedCommunityChoice?.value,
          ),
        ),
      });
    }
    if (
      !this.props.initialCommunities?.length &&
      nextProps.initialCommunities?.length
    ) {
      this.setState({
        communitySearchOptions:
          nextProps.initialCommunities?.map(communityToChoice) ?? [],
      });
    }
    if (this.props.loading && !nextProps.loading) {
      this.setState({ bypassNavWarning: false });
    }
    if (this.props.params !== nextProps.params && nextProps.params) {
      const params = nextProps.params;
      for (const k in params) {
        if (this.props.params?.[k] !== params[k]) {
          this.setState(s => ({
            form: { ...s.form, [k]: params[k] as unknown },
          }));
        }
      }
    }
  }

  get editorType(): EditorType {
    const p = this.props;
    let type_: EditorType;

    if (
      !p.post_view ||
      p.post_view?.creator.id === p.myUserInfo?.local_user_view.person.id
    ) {
      type_ = "creator";
    } else if (p.post_view?.can_mod) {
      type_ = "mod_or_admin";
    } else {
      type_ = "none";
    }
    return type_;
  }

  render() {
    const firstLang = this.state.form.language_id;
    const selectedLangs = firstLang ? Array.of(firstLang) : undefined;

    const url = this.state.form.url;
    const imageUploadDisabled = this.props.localSite.image_upload_disabled;

    if (this.state.draftLoading) {
      return <Spinner large />; // audioprn
    }

    return (
      <form className="post-form" onSubmit={e => handlePostSubmit(this, e)}>
        <Prompt
          message={I18NextService.i18n.t("block_leaving")}
          when={
            !!(
              this.state.form.name ||
              this.state.form.url ||
              this.state.form.body
            ) && !this.state.bypassNavWarning
          }
        />
        {/* audioprn: the user's drafts, when making a new post */}
        {!this.props.post_view && (
          <PostDrafts
            key={this.state.draftSaves}
            current={this.state.draftId}
            onDelete={id =>
              id === this.state.draftId && this.setState({ draftId: undefined })
            }
          />
        )}
        {/* Show an un-editable title for mod edits */}
        {this.editorType === "mod_or_admin" && this.props.post_view && (
          <div className="mb-3">
            <PostName post={this.props.post_view.post} showBody={"preview"} />
          </div>
        )}
        {/* audioprn: not when all are deleted (creator page posts have none); above the title (user, 2026-11-18) */}
        {this.props.selectedCommunityTags?.some(t => !t.deleted) && (
          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label" htmlFor="post-tags">
              Flair
            </label>
            <div className="col-sm-10">
              {/* audioprn: exactly one flair per post */}
              <FilterChipSelect
                label={"tags"}
                multiple={false}
                allOptions={this.props.selectedCommunityTags
                  .filter(t => !t.deleted)
                  .map(tag => {
                    return {
                      value: tag.id.toString(),
                      label: communityTagName(tag),
                    };
                  })}
                selectedOptions={(this.state.form.tags ?? []).map(t =>
                  t.toString(),
                )}
                onSelect={choices => handleTagsChange(this, choices)}
              />
            </div>
          </div>
        )}
        {this.editorType === "creator" && (
          <>
            <div className="mb-3 row">
              <label className="col-sm-2 col-form-label" htmlFor="post-title">
                {I18NextService.i18n.t("title")}
              </label>
              <div className="col-sm-10">
                <textarea
                  value={this.state.form.name}
                  id="post-title"
                  onInput={e => handlePostNameChange(this, e)}
                  className={`form-control ${
                    !validTitle(this.state.form.name) && "is-invalid"
                  }`}
                  required
                  rows={1}
                  minLength={3}
                  maxLength={MAX_POST_TITLE_LENGTH}
                  ref={this.postTitleRef}
                />
                {!validTitle(this.state.form.name) && (
                  <div className="invalid-feedback">
                    {I18NextService.i18n.t("invalid_post_title")}
                  </div>
                )}
                {/* audioprn: gender tag first, at most 7 other tags; the user's help text while empty */}
                {this.titleTagError && (
                  <div
                    className={`small ${this.state.form.name ? "text-danger" : "text-muted"}`}
                  >
                    {this.state.form.name
                      ? this.titleTagError
                      : "Input your gender tag, title, and up to 7 tags here."}
                  </div>
                )}
                {this.renderSuggestedPosts()}
              </div>
            </div>
            {this.creditsInputs()}
            <div className="mb-3 row">
              <label className="col-sm-2 col-form-label" htmlFor="post-url">
                {I18NextService.i18n.t("url")}
              </label>
              <div className="col-sm-10">
                <input
                  type="url"
                  placeholder={I18NextService.i18n.t("optional")}
                  id="post-url"
                  className="form-control mb-3"
                  value={url}
                  onInput={e => handlePostUrlChange(this, e)}
                  onPaste={e => handleImageUploadPaste(this, e)}
                />
                {this.renderSuggestedTitleCopy()}
                {/* Show a warning for media posts with missing alt text */}
                {url && isMedia(url) && !this.state.form.alt_text && (
                  <div className="alert alert-warning" role="alert">
                    {I18NextService.i18n.t("missing_alt_text")}
                  </div>
                )}
                {url && validURL(url) && (
                  <div>
                    <a
                      href={`${webArchiveUrl}/save/${encodeURIComponent(url)}`}
                      className="me-2 d-inline-block float-right text-muted small fw-bold"
                      rel={relTags}
                    >
                      archive.org {I18NextService.i18n.t("archive_link")}
                    </a>
                    <a
                      href={`${ghostArchiveUrl}/search${getQueryString({ term: url })}`}
                      className="me-2 d-inline-block float-right text-muted small fw-bold"
                      rel={relTags}
                    >
                      ghostarchive.org {I18NextService.i18n.t("archive_link")}
                    </a>
                    <a
                      href={`${archiveTodayUrl}/${getQueryString({ run: "1", url })}`}
                      className="me-2 d-inline-block float-right text-muted small fw-bold"
                      rel={relTags}
                    >
                      archive.today {I18NextService.i18n.t("archive_link")}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="mb-3 row">
              {!this.props.localSite.image_upload_disabled && (
                <>
                  <label
                    htmlFor="file-upload"
                    className={"col-sm-2 col-form-label"}
                  >
                    {capitalizeFirstLetter(I18NextService.i18n.t("image"))}
                    <Icon icon="image" classes="icon-inline ms-1" />
                  </label>
                  <div className="col-sm-10">
                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*,video/*"
                      name="file"
                      className="small col-sm-10 form-control"
                      disabled={userNotLoggedInOrBanned(this.props.myUserInfo)}
                      onChange={e => handleImageUpload(this, e)}
                    />
                    {this.state.imageLoading && <Spinner />}
                    {url && isImage(url) && (
                      <img src={url} className="img-fluid mt-2" alt="" />
                    )}
                    {this.state.uploadedImage && (
                      <button
                        className="btn btn-danger btn-sm mt-2"
                        onClick={() => handleImageDelete(this)}
                      >
                        <Icon icon="x" classes="icon-inline me-1" />
                        {capitalizeFirstLetter(I18NextService.i18n.t("delete"))}
                      </button>
                    )}
                  </div>
                </>
              )}

              {this.props.crossPosts && this.props.crossPosts.length > 0 && (
                <>
                  <div className="my-1 text-muted small fw-bold">
                    {I18NextService.i18n.t("cross_posts")}
                  </div>
                  <PostListings
                    showCommunity
                    multiCommunity={false}
                    viewOnly
                    showMarkRead="hide"
                    posts={this.props.crossPosts}
                    showCrossPosts="show_separately"
                    enableNsfw={this.props.enableNsfw}
                    showAdultConsentModal={this.props.showAdultConsentModal}
                    allLanguages={this.props.allLanguages}
                    siteLanguages={this.props.siteLanguages}
                    myUserInfo={this.props.myUserInfo}
                    localSite={this.props.localSite}
                    admins={this.props.admins}
                    postListingMode="list"
                    voteLoading={undefined}
                    muteCommunityName={false}
                    mutePersonName
                    hideAvatar
                    // All of these are unused, since its view only
                    onPostEdit={() => {}}
                    onPostModEdit={() => {}}
                    onPostVote={() => {}}
                    onPostReport={() => {}}
                    onBlockPerson={() => {}}
                    onBlockCommunity={() => {}}
                    onLockPost={() => {}}
                    onWarnPost={() => {}}
                    onDeletePost={() => {}}
                    onRemovePost={() => {}}
                    onSavePost={() => {}}
                    onFeaturePost={() => {}}
                    onPurgePerson={() => {}}
                    onPurgePost={() => {}}
                    onBanPersonFromCommunity={() => {}}
                    onBanPerson={() => {}}
                    onAddModToCommunity={() => {}}
                    onAddAdmin={() => {}}
                    onTransferCommunity={() => {}}
                    onMarkPostAsRead={() => {}}
                    onHidePost={() => {}}
                    onPersonNote={() => {}}
                    onScrollIntoCommentsClick={() => {}}
                  />
                </>
              )}
            </div>
            {url && isMedia(url) && (
              <div className="mb-3 row">
                <label
                  className="col-sm-2 col-form-label"
                  htmlFor="post-alt-text"
                >
                  {I18NextService.i18n.t("column_alttext")}
                </label>
                <div className="col-sm-10">
                  <input
                    autoComplete="false"
                    name="alt_text"
                    placeholder={I18NextService.i18n.t("optional")}
                    type="text"
                    className="form-control mb-3"
                    id="post-alt-text"
                    value={this.state.form.alt_text}
                    onInput={e => handleAltTextChange(this, e)}
                  />
                </div>
              </div>
            )}
            {/* audioprn: no thumbnails while image uploads are off */}
            {!isImage(url || "") &&
              !this.props.localSite.image_upload_disabled && (
                <div className="mb-3 row">
                  <label
                    className="col-sm-2 col-form-label"
                    htmlFor="post-custom-thumbnail"
                  >
                    {I18NextService.i18n.t("custom_thumbnail_url")}
                  </label>
                  <div className="col-sm-10">
                    <input
                      type="url"
                      id="post-custom-thumbnail"
                      placeholder={I18NextService.i18n.t("optional")}
                      className="form-control mb-3"
                      value={this.state.form.custom_thumbnail}
                      onInput={e => handleCustomThumbnailChange(this, e)}
                    />
                  </div>
                </div>
              )}
            <div className="mb-3 row">
              <label className="col-sm-2 col-form-label">
                {I18NextService.i18n.t("body")}
              </label>
              <div className="col-sm-10">
                {/* audioprn: markdown or rich text mode, both store markdown */}
                <div className="btn-group btn-group-sm mb-2" role="group">
                  {[true, false].map(rich => (
                    <button
                      type="button"
                      className={`btn ${!!this.state.richText === rich ? "btn-secondary" : "btn-outline-secondary"}`}
                      aria-pressed={!!this.state.richText === rich}
                      onClick={() => this.setState({ richText: rich })}
                    >
                      {rich ? "Rich text" : "Markdown"}
                    </button>
                  ))}
                </div>
                {this.state.richText ? (
                  <RichTextEditor
                    initialMarkdown={this.state.form.body ?? ""}
                    onChange={val => handlePostBodyChange(this, val)}
                  />
                ) : (
                  <MarkdownTextArea
                    initialContent={this.state.form.body}
                    placeholder={I18NextService.i18n.t("optional")}
                    onContentChange={val => handlePostBodyChange(this, val)}
                    onContentBlur={val => handlePostBodyBlur(this, val)}
                    allLanguages={this.props.allLanguages}
                    siteLanguages={this.props.siteLanguages}
                    hideNavigationWarnings
                    maxLength={postMarkdownFieldCharacterLimit}
                    myUserInfo={this.props.myUserInfo}
                    imageUploadDisabled={imageUploadDisabled}
                  />
                )}
              </div>
            </div>
            <LanguageSelect
              allLanguages={this.props.allLanguages}
              siteLanguages={this.props.siteLanguages}
              selectedLanguageIds={selectedLangs}
              multiple={false}
              onChange={val => handleLanguageChange(this, val)}
              myUserInfo={this.props.myUserInfo}
            />
            {/* audioprn: no community picker while communities are hidden (posts go to `main`).
                New posts go to the Content page only, unless a cummunity is picked. */}
            {!this.props.post_view && SHOW_COMMUNITIES && (
              <div className="mb-3 row align-items-center">
                <label
                  className="col-sm-2 col-form-label"
                  htmlFor="post-community"
                >
                  Post to
                </label>
                <div className="col-sm-10">
                  {/* The picker stays mounted (hidden): its widget rearranges the page. */}
                  {this.props.contentPageOnly && !this.state.pickCummunity && (
                    <>
                      <span className="me-3">Content page only</span>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        onClick={() => this.setState({ pickCummunity: true })}
                      >
                        Post in a cummunity instead
                      </button>
                    </>
                  )}
                  <div
                    className={
                      this.props.contentPageOnly && !this.state.pickCummunity
                        ? "d-none"
                        : undefined
                    }
                  >
                    <FilterChipSelect
                      label={"select_a_community"}
                      multiple={false}
                      allOptions={this.state.communitySearchOptions}
                      selectedOptions={
                        this.state.form.community_id &&
                        !this.props.contentPageOnly
                          ? [this.state.form.community_id.toString()]
                          : []
                      }
                      onSearch={text => handleCommunitySearch(this, text)}
                      onSelect={choices =>
                        handleCommunitySelect(this, choices[0])
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0"
                      onClick={() => {
                        this.setState({ pickCummunity: false });
                        updateUrl(this, () =>
                          this.props.onSelectCommunity?.({
                            value: "",
                            label: "",
                          }),
                        );
                      }}
                    >
                      Content page only instead
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {this.props.enableNsfw && !this.props.isNsfwCommunity && (
          <div className="form-check mb-3">
            <input
              className="form-check-input"
              id="post-nsfw"
              type="checkbox"
              checked={this.state.form.nsfw}
              onChange={e => handlePostNsfwChange(this, e)}
            />
            <label className="form-check-label" htmlFor="post-nsfw">
              {I18NextService.i18n.t("nsfw")}
            </label>
          </div>
        )}
        {this.editorType === "creator" && !this.props.post_view && (
          <div className="mb-3 row">
            <label className="col-sm-2 col-form-label" htmlFor="post-schedule">
              {I18NextService.i18n.t("scheduled_publish_time")}
            </label>
            <div className="col-sm-10">
              <input
                type="datetime-local"
                value={this.state.form.scheduled_publish_time_at}
                min={unixTimeToLocalDateStr(Date.now())}
                id="post-schedule"
                className="form-control mb-3"
                onInput={e => handlePostScheduleChange(this, e)}
              />
            </div>
          </div>
        )}
        <input
          tabIndex={-1}
          autoComplete="false"
          name="a_password"
          type="text"
          className="form-control honeypot"
          id="register-honey"
          value={this.state.form.honeypot}
          onInput={e => handleHoneyPotChange(this, e)}
        />
        <div className="mb-3 row">
          <div className="col-sm-10">
            <button
              // audioprn: mistakes show as a popup when clicked (see formError)
              disabled={this.props.loading}
              type="submit"
              className="btn btn-light border-light-subtle me-2"
            >
              {this.props.loading ? (
                <Spinner />
              ) : this.props.post_view ? (
                capitalizeFirstLetter(I18NextService.i18n.t("save"))
              ) : (
                capitalizeFirstLetter(I18NextService.i18n.t("create"))
              )}
            </button>
            {/* audioprn: keep a new post as a draft to finish later */}
            {!this.props.post_view && (
              <button
                type="button"
                className="btn btn-light border-light-subtle me-2"
                disabled={this.props.loading}
                onClick={() => handleSaveDraft(this)}
              >
                Save draft
              </button>
            )}
            {this.props.post_view && (
              <button
                type="button"
                className="btn btn-light border-light-subtle"
                onClick={() => handleCancel(this)}
              >
                {I18NextService.i18n.t("cancel")}
              </button>
            )}
          </div>
        </div>
        {/* audioprn: the creator can delete their post for good (user, 2026-11-18) */}
        {this.props.post_view?.creator.id ===
          this.props.myUserInfo?.local_user_view.person.id && (
          <button
            type="button"
            className="btn btn-danger btn-lg w-100 mb-3"
            onClick={() => handleDeleteForGood(this)}
          >
            🗑️ Delete post
          </button>
        )}
      </form>
    );
  }

  renderSuggestedTitleCopy(): InfernoNode | void {
    switch (this.state.metadataRes.state) {
      case "loading":
        return <Spinner />;
      case "success": {
        // Clean up the title of any extra whitespace and replace &nbsp; with a space
        const suggestedTitle = this.state.metadataRes.data.metadata.title
          ?.trim()
          .replace(/\s+/g, " ");
        return (
          suggestedTitle && (
            <button
              type="button"
              className="mt-1 small border-0 bg-transparent p-0 d-block text-muted fw-bold pointer"
              onClick={() => handleCopySuggestedTitle(this, suggestedTitle)}
            >
              {I18NextService.i18n.t("copy_suggested_title", { title: "" })}{" "}
              {suggestedTitle}
            </button>
          )
        );
      }
    }
  }

  renderSuggestedPosts(): InfernoNode | void {
    switch (this.state.suggestedPostsRes.state) {
      case "loading":
        return <Spinner />;
      case "success": {
        const suggestedPosts = this.state.suggestedPostsRes.data.items;

        return (
          suggestedPosts &&
          suggestedPosts.length > 0 && (
            <>
              <div className="my-1 text-muted small fw-bold">
                {I18NextService.i18n.t("related_posts")}
              </div>
              <PostListings
                showCommunity
                multiCommunity={false}
                viewOnly
                showMarkRead="hide"
                posts={suggestedPosts}
                showCrossPosts="show_separately"
                enableNsfw={this.props.enableNsfw}
                showAdultConsentModal={this.props.showAdultConsentModal}
                allLanguages={this.props.allLanguages}
                siteLanguages={this.props.siteLanguages}
                myUserInfo={this.props.myUserInfo}
                localSite={this.props.localSite}
                admins={this.props.admins}
                postListingMode="list"
                voteLoading={undefined}
                muteCommunityName={false}
                mutePersonName
                hideAvatar
                // All of these are unused, since its view only
                onPostEdit={() => {}}
                onPostModEdit={() => {}}
                onPostVote={() => {}}
                onPostReport={() => {}}
                onBlockPerson={() => {}}
                onBlockCommunity={() => {}}
                onLockPost={() => {}}
                onWarnPost={() => {}}
                onDeletePost={() => {}}
                onRemovePost={() => {}}
                onSavePost={() => {}}
                onFeaturePost={() => {}}
                onPurgePerson={() => {}}
                onPurgePost={() => {}}
                onBanPersonFromCommunity={() => {}}
                onBanPerson={() => {}}
                onAddModToCommunity={() => {}}
                onAddAdmin={() => {}}
                onTransferCommunity={() => {}}
                onMarkPostAsRead={() => {}}
                onHidePost={() => {}}
                onPersonNote={() => {}}
                onScrollIntoCommentsClick={() => {}}
              />
            </>
          )
        );
      }
    }
  }
}

const fetchPageTitle = debounce(async (i: PostForm) => {
  const url = i.state.form.url;
  if (url && validURL(url)) {
    // If its a magnet link, fill in the download name
    if (isMagnetLink(url)) {
      const title = extractMagnetLinkDownloadName(url);
      if (title) {
        i.setState({
          metadataRes: {
            state: "success",
            data: {
              metadata: { title },
            },
          },
        });
      }
    } else {
      i.setState({ metadataRes: LOADING_REQUEST });
      i.setState({
        metadataRes: await HttpService.client.getSiteMetadata({ url }),
      });
    }
  }
});

const fetchSimilarPosts = debounce(async (i: PostForm) => {
  const search_term = i.state.form.name;
  if (search_term && search_term !== "") {
    i.setState({ suggestedPostsRes: LOADING_REQUEST });
    i.setState({
      suggestedPostsRes: await HttpService.client.getPosts({
        search_term,
        search_title_only: true,
        limit: 5,
        sort: "top",
        type_: "all",
        community_id: i.state.form.community_id,
      }),
    });
  }
});

function updateUrl(i: PostForm, update: () => void) {
  i.setState({ bypassNavWarning: true });
  update();
  i.setState({ bypassNavWarning: false });
}

function handlePostSubmit(i: PostForm, event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  // audioprn: say clearly what's wrong
  const error = i.formError;
  if (error) {
    errorPopup(error);
    return;
  }

  const pForm = i.state.form;
  const pv = i.props.post_view;
  const scheduled_publish_time_at = getUnixTimeLemmy(
    pForm.scheduled_publish_time_at,
  );
  // audioprn: credits from the three inputs
  const credits = CREDIT_ROLES.filter(
    ({ role }) => !i.scriptOffer || role === "writer",
  ).flatMap(({ role }) => parseCredits(role, i.state.credits[role] ?? ""));

  if (pv) {
    if (i.editorType === "creator") {
      // audioprn: the script and fill terms (when changed) first, so the post page shows them
      const script = i.state.script;
      const scriptSaved =
        i.scriptOffer &&
        script &&
        i.state.scriptLoaded &&
        JSON.stringify(script) !== i.state.scriptLoaded
          ? savePostScript(pv.post.id, script).catch((e: Error) =>
              toast(e.message, "danger"),
            )
          : undefined;
      Promise.resolve(scriptSaved)
        .then(() =>
          Promise.resolve(
            i.props.onEdit?.(
              {
                post_id: pv.post.id,
                name: pForm.name,
                url: pForm.url,
                body: pForm.body,
                nsfw: pForm.nsfw,
                language_id: pForm.language_id,
                custom_thumbnail: pForm.custom_thumbnail,
                alt_text: pForm.alt_text,
                tags: pForm.tags,
                scheduled_publish_time_at,
              },
              () => {
                i.setState({ bypassNavWarning: true });
              },
            ),
          ),
        )
        .then(res => {
          if (res?.state === "failed") {
            backendErrorPopup(res.err);
          } else if (i.state.creditsLoaded) {
            // Only once the edit went through, and never over credits that didn't load.
            savePostCredits(
              pv.post.id,
              credits,
              !!i.state.offContent,
              i.noMen,
              i.cashBoxToSave,
            ).catch(e => toast(e.message, "danger"));
          }
          // audioprn: the script this fills, when changed
          if (
            res?.state !== "failed" &&
            i.state.fillLoaded !== undefined &&
            i.state.fillOf !== i.state.fillLoaded
          ) {
            saveScriptFill(pv.post.id, i.state.fillOf ?? "").catch(e =>
              toast(e.message, "danger"),
            );
          }
        });
    } else if (i.editorType === "mod_or_admin") {
      i.props.onModEdit?.(
        {
          post_id: pv.post.id,
          nsfw: pForm.nsfw,
          tags: pForm.tags,
        },
        () => {
          i.setState({ bypassNavWarning: true });
        },
      );
    }
  } else if (pForm.name && pForm.community_id) {
    i.props.onCreate?.(
      {
        name: pForm.name,
        community_id: pForm.community_id,
        url: pForm.url,
        body: pForm.body,
        nsfw: pForm.nsfw,
        language_id: pForm.language_id,
        honeypot: pForm.honeypot,
        custom_thumbnail: pForm.custom_thumbnail,
        alt_text: pForm.alt_text,
        // audioprn: only flairs of the chosen cummunity. A flair picked before switching
        // cummunity was sent along, and Lemmy saved the post and then refused it (2026-11-18).
        tags: pForm.tags?.filter(id =>
          i.props.selectedCommunityTags?.some(t => t.id === id && !t.deleted),
        ),
        scheduled_publish_time_at,
      },
      () => {
        i.setState({ bypassNavWarning: true });
      },
      async postId => {
        const script = i.state.script;
        const poll = i.state.poll;
        // Each part is saved on its own, so one failing doesn't lose the others.
        const failed = (
          await Promise.allSettled([
            savePostCredits(
              postId,
              credits,
              !!i.state.offContent,
              i.noMen,
              i.cashBoxToSave,
            ),
            i.scriptOffer &&
              script &&
              (script.body.trim() || script.link.trim()) &&
              savePostScript(postId, script),
            i.scriptFill &&
              i.state.fillOf?.trim() &&
              saveScriptFill(postId, i.state.fillOf),
            poll &&
              createPostPoll(
                postId,
                poll.question,
                poll.options,
                new Date(poll.ends),
              ),
          ])
        ).find((r): r is PromiseRejectedResult => r.status === "rejected");
        // audioprn: the draft is now a post
        if (i.state.draftId) {
          await deleteDraft(i.state.draftId).catch(() => {});
        }
        if (failed) {
          throw new Error(
            `Your post was created, but part of it wasn't saved: ${failed.reason.message}`,
          );
        }
      },
    );
  }
}
// audioprn: save the whole form as a draft (JSON), or update the open draft.
async function handleSaveDraft(i: PostForm) {
  const { form, credits, offContent, noMen, cashBox, richText, poll, script } =
    i.state;
  try {
    const { id } = await saveDraft(
      i.state.draftId,
      form.name ?? "",
      JSON.stringify({
        form: { ...form, honeypot: undefined },
        credits,
        offContent,
        noMen,
        cashBox,
        richText,
        poll,
        script,
      }),
    );
    i.setState(s => ({ draftId: id, draftSaves: (s.draftSaves ?? 0) + 1 }));
    toast("Draft saved.");
  } catch (e) {
    errorPopup((e as Error).message);
  }
}

// audioprn: open a saved draft; switch to its community if the page is on another one.
async function loadDraft(i: PostForm, id: number) {
  try {
    const saved: Pick<
      PostFormState,
      | "form"
      | "credits"
      | "offContent"
      | "noMen"
      | "cashBox"
      | "richText"
      | "poll"
      | "script"
    > = JSON.parse((await getDraft(id)).data);
    i.setState(s => ({
      ...saved,
      form: { ...s.form, ...saved.form },
      draftId: id,
    }));
    const community = saved.form.community_id;
    if (
      community &&
      community !== getIdFromString(i.props.selectedCommunityChoice?.value)
    ) {
      updateUrl(i, () =>
        i.props.onSelectCommunity?.({ value: String(community), label: "" }),
      );
    }
  } catch (e) {
    errorPopup((e as Error).message);
  }
  i.setState({ draftLoading: false });
}

function handlePostBodyChange(i: PostForm, val: string) {
  i.setState(s => ((s.form.body = val), s));
}

function handlePostBodyBlur(i: PostForm, val: string) {
  updateUrl(i, () => i.props.onBodyBlur?.(val));
}

function handleLanguageChange(i: PostForm, val: number[]) {
  i.setState(s => ((s.form.language_id = val.at(0)), s));
  updateUrl(i, () => i.props.onLanguageChange?.(val.at(0)));
}

const handleCommunitySearch = debounce(async (i: PostForm, text: string) => {
  const { selectedCommunityChoice } = i.props;
  i.setState({ communitySearchLoading: true });

  const newOptions: Choice[] = [];

  if (selectedCommunityChoice) {
    newOptions.push(selectedCommunityChoice);
  }

  if (text.length > 0) {
    newOptions.push(
      ...filterCommunitySelection(
        await searchCommunities(text),
        i.props.myUserInfo,
      ).map(communityToChoice),
    );

    i.setState({
      communitySearchOptions: newOptions,
    });
  }

  i.setState({
    communitySearchLoading: false,
  });
});

function handleCommunitySelect(i: PostForm, choice: Choice) {
  updateUrl(i, () => i.props.onSelectCommunity?.(choice));
}

async function handleCopySuggestedTitle(i: PostForm, suggestedTitle?: string) {
  if (suggestedTitle) {
    i.setState(
      s => (
        (s.form.name = suggestedTitle?.substring(0, MAX_POST_TITLE_LENGTH)),
        s
      ),
    );
    await fetchSimilarPosts(i);
    i.setState({ suggestedPostsRes: EMPTY_REQUEST });
    setTimeout(() => {
      if (i.postTitleRef.current) {
        autosize.update(i.postTitleRef.current);
      }
    }, 10);

    updateUrl(i, () =>
      i.props.onCopySuggestedTitle?.(i.state.form.url!, suggestedTitle),
    );
  }
}

async function handlePostUrlChange(
  i: PostForm,
  event: FormEvent<HTMLInputElement>,
) {
  const url = event.target.value;

  i.setState(prev => ({
    ...prev,
    form: {
      ...prev.form,
      url,
    },
    uploadedImage: undefined,
  }));

  await fetchPageTitle(i);
}

function handlePostNsfwChange(i: PostForm, event: FormEvent<HTMLInputElement>) {
  i.setState(s => ((s.form.nsfw = event.target.checked), s));

  updateUrl(i, () =>
    i.props.onNsfwChange?.(event.target.checked ? "true" : "false"),
  );
}

function handlePostScheduleChange(
  i: PostForm,
  event: FormEvent<HTMLInputElement>,
) {
  const scheduled_publish_time = event.target.value;

  i.setState(
    s => ((s.form.scheduled_publish_time_at = scheduled_publish_time), s),
  );
}

function handleHoneyPotChange(i: PostForm, event: FormEvent<HTMLInputElement>) {
  i.setState(s => ((s.form.honeypot = event.target.value), s));
}

function handleAltTextChange(i: PostForm, event: FormEvent<HTMLInputElement>) {
  i.setState(s => ((s.form.alt_text = event.target.value), s));
}

function handleCustomThumbnailChange(
  i: PostForm,
  event: FormEvent<HTMLInputElement>,
) {
  i.setState(s => ((s.form.custom_thumbnail = event.target.value), s));
}

function handleCancel(i: PostForm) {
  i.props.onCancel?.();
}

/** audioprn: delete the post for good, after asking; then go to the creator's page. */
async function handleDeleteForGood(i: PostForm) {
  const pv = i.props.post_view;
  if (
    !pv ||
    !confirm(
      "Delete this post for good? Its comments, reactions and awards go with it. This can't be undone.",
    )
  ) {
    return;
  }
  try {
    await call("POST", "/post_delete", { post_id: pv.post.id });
    toast("Post deleted.");
    // No "leave this page?" question: the post is gone.
    i.setState({ bypassNavWarning: true }, () =>
      (i.context as RouterContext).router.history.push(`/u/${pv.creator.name}`),
    );
  } catch (e) {
    toast((e as Error).message, "danger");
  }
}

async function handleImageUploadPaste(
  i: PostForm,
  event: ClipboardEvent<HTMLInputElement>,
) {
  const image = event.clipboardData?.files[0];
  if (image) {
    await handleImageUpload(i, image);
  }
}

async function handleImageUpload(
  i: PostForm,
  event: File | FormEvent<HTMLInputElement>,
) {
  let file: File | undefined;
  if (event instanceof Event) {
    event.preventDefault();
    file = event.target.files?.[0];
  } else {
    file = event;
  }

  i.setState({ imageLoading: true });

  if (file) {
    const res = await HttpService.client.uploadImage({ image: file });
    if (res.state === "success") {
      const url = res.data.image_url;
      i.setState(prev => ({
        ...prev,
        form: {
          ...prev.form,
          url,
        },
        uploadedImage: res.data,
      }));
    } else if (res.state === "failed") {
      console.error(res.err.name);
      toast(I18NextService.i18n.t(res.err.name as NoOptionI18nKeys), "danger");
    }
    i.setState({ imageLoading: false });
  }
}

function handleTagsChange(i: PostForm, choices: Choice[]) {
  i.setState(s => ((s.form.tags = choices.map(c => Number(c.value))), s));
}

async function handlePostNameChange(
  i: PostForm,
  event: FormEvent<HTMLTextAreaElement>,
) {
  i.setState(s => ((s.form.name = event.target.value), s));
  await fetchSimilarPosts(i);
}

async function handleImageDelete(i: PostForm) {
  const { uploadedImage } = i.state;

  if (uploadedImage) {
    await HttpService.client.deleteMedia({
      filename: uploadedImage.filename,
    });
  }

  i.setState(prev => ({
    ...prev,
    uploadedImage: undefined,
    imageLoading: false,
    form: {
      ...prev.form,
      url: "",
    },
  }));
}
