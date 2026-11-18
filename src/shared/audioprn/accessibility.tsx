// audioprn: reading options for the whole site (text size and font), remembered per browser,
// shown on masterlists and in Settings and applied when the site starts; and the accessible
// Popup the site's own popups use.
import { Component, createRef, InfernoNode } from "inferno";

const KEY = "audioprn_accessibility";
const FONTS: Record<string, string> = {
  Default: "",
  Arial: '"audioprn emoji", Arial, Helvetica, sans-serif',
  Times: '"audioprn emoji", "Times New Roman", Times, serif',
  Verdana: '"audioprn emoji", Verdana, Geneva, sans-serif',
};
const SIZES = [80, 90, 100, 110, 125, 150, 175];

interface Options {
  size: number;
  font: string;
}

function load(): Options {
  try {
    return {
      size: 100,
      font: "Default",
      ...JSON.parse(localStorage.getItem(KEY) ?? "{}"),
    };
  } catch {
    return { size: 100, font: "Default" };
  }
}

/** Applies the saved options to the page (on start and after a change). */
export function applyAccessibility(options = load()) {
  document.documentElement.style.fontSize = `${options.size}%`;
  document.body.style.fontFamily = FONTS[options.font] ?? "";
}

export class AccessibilityOptions extends Component<object, Options> {
  state: Options = { size: 100, font: "Default" };

  componentDidMount() {
    this.setState(load());
  }

  set(options: Options) {
    this.setState(options);
    applyAccessibility(options);
    try {
      localStorage.setItem(KEY, JSON.stringify(options));
    } catch {
      // Not remembered, that's all.
    }
  }

  render() {
    const { size, font } = this.state;
    const step = (by: number) =>
      SIZES[
        Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + by))
      ] ?? 100;
    const button = "btn btn-sm btn-light border-light-subtle";
    return (
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="small">Text size</span>
        <button
          type="button"
          className={button}
          aria-label="Smaller text"
          onClick={() => this.set({ size: step(-1), font })}
        >
          −
        </button>
        <span className="small">{size}%</span>
        <button
          type="button"
          className={button}
          aria-label="Bigger text"
          onClick={() => this.set({ size: step(1), font })}
        >
          +
        </button>
        <span className="small ms-2">Font</span>
        {Object.keys(FONTS).map(name => (
          <button
            type="button"
            className={`btn btn-sm ${font === name ? "btn-secondary" : "btn-light border-light-subtle"}`}
            style={FONTS[name] ? `font-family: ${FONTS[name]}` : undefined}
            onClick={() => this.set({ size, font: name })}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-link"
          onClick={() => this.set({ size: 100, font: "Default" })}
        >
          Reset
        </button>
      </div>
    );
  }
}

const FOCUSABLE = "a[href], button:not([disabled]), input, select, textarea";

interface PopupProps {
  /** What screen readers call the popup. */
  label: string;
  onClose: () => void;
  /** Instead of the dimmed overlay (a click on it closes the popup). */
  className?: string;
  style?: string;
  children?: InfernoNode;
}

/**
 * A popup over the page that keyboard and screen reader users can use: focus moves to its first
 * button or field and stays inside it, Escape closes it, and focus goes back where it was.
 */
export class Popup extends Component<PopupProps, object> {
  private ref = createRef<HTMLDivElement>();
  private opener: HTMLElement | null = null;

  componentDidMount() {
    this.opener = document.activeElement as HTMLElement | null;
    this.ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }

  componentWillUnmount() {
    this.opener?.focus();
  }

  keyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.props.onClose();
    } else if (e.key === "Tab" && this.ref.current) {
      const all = [
        ...this.ref.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ];
      const edge = e.shiftKey ? all[0] : all[all.length - 1];
      if (document.activeElement === edge) {
        e.preventDefault();
        (e.shiftKey ? all[all.length - 1] : all[0])?.focus();
      }
    }
  }

  render() {
    const { label, onClose, className, style, children } = this.props;
    return (
      // Escape and Tab are handled on the dialog itself, for whatever inside has focus.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
      <div
        ref={this.ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={
          className ??
          "position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-start p-3 overflow-auto"
        }
        style={style ?? "background: rgba(0, 0, 0, 0.5); z-index: 1050"}
        onKeyDown={e => this.keyDown(e)}
        onClick={e => {
          if (!className && e.target === e.currentTarget) onClose();
        }}
      >
        {children}
      </div>
    );
  }
}
