// audioprn: reading options for the whole site (text size and font), remembered per browser.
// Shown on masterlists and in Settings; applied when the site starts.
import { Component } from "inferno";

const KEY = "audioprn_accessibility";
const FONTS: Record<string, string> = {
  Default: "",
  Arial: "Arial, Helvetica, sans-serif",
  Times: '"Times New Roman", Times, serif',
  Verdana: "Verdana, Geneva, sans-serif",
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
