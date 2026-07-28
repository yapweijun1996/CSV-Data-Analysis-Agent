import { j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
const pulseStyle = (delayMs) => ({
  animationDelay: `${delayMs}ms`,
  animationDuration: "1.8s"
});
const IconThinking = ({ className = "h-5 w-5", ...props }) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
  "svg",
  {
    "aria-hidden": "true",
    className,
    fill: "none",
    viewBox: "0 0 24 24",
    xmlns: "http://www.w3.org/2000/svg",
    ...props,
    children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12", cy: "12", r: "8.5", opacity: "0.16", stroke: "currentColor", strokeWidth: "1.5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "path",
        {
          d: "M8 12a4 4 0 0 1 6.8-2.8",
          stroke: "currentColor",
          strokeLinecap: "round",
          strokeWidth: "1.6"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "path",
        {
          d: "M16 12a4 4 0 0 1-6.8 2.8",
          opacity: "0.45",
          stroke: "currentColor",
          strokeLinecap: "round",
          strokeWidth: "1.6"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "15", cy: "9.2", r: "1.4", className: "animate-pulse", fill: "currentColor", style: pulseStyle(0) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "12.1", cy: "12.1", r: "1.25", className: "animate-pulse", fill: "currentColor", style: pulseStyle(180) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("circle", { cx: "9.1", cy: "14.9", r: "1.1", className: "animate-pulse", fill: "currentColor", style: pulseStyle(360) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "path",
        {
          d: "M17.4 5.7l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5.5-1.1Z",
          fill: "currentColor",
          opacity: "0.9"
        }
      )
    ]
  }
);
const IconSettings = (props) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  "svg",
  {
    xmlns: "http://www.w3.org/2000/svg",
    className: "h-5 w-5",
    fill: "none",
    viewBox: "0 0 24 24",
    strokeWidth: 2,
    stroke: "currentColor",
    ...props,
    children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "path",
      {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
      }
    )
  }
);
export {
  IconThinking as I,
  IconSettings as a
};
