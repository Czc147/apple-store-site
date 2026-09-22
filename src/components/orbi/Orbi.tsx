/**
 * Orbi —— 官方聊天形象（原创 IP）。
 *
 * 从 `C:\Users\22346\Documents\ChatGPT\svg动画` 整体搬来（用户 2026-09-22 要求
 * 「官方对象形象和聊天气泡、动画等都复用」）。那份项目里的版本已经包含此前修好的
 * 两个 bug：双击触发 surprised、surprised 时眼睛被眨眼动画覆盖导致放不大。
 *
 * 搬运时**不改视觉**，只把它接进本仓的构建设置；配色仍是它自带的一套 CSS 变量
 * （--orbi-*），与本站 token 互不干扰，所以不必也不该强行换成 apple-* 色。
 * 以后要调 Orbi 的动画，改 Orbi.css；要改它在页面里的尺寸/位置，用 props 或外层容器。
 */
import { useEffect, useRef, useState } from "react";
import "./Orbi.css";

export type OrbiMood =
  | "idle"
  | "happy"
  | "thinking"
  | "wave"
  | "surprised";

export interface OrbiProps {
  mood?: OrbiMood;
  size?: number;
  interactive?: boolean;
  className?: string;
}

/** 单次点击 → happy；连击间隔小于这个值 → surprised（见 handleClick） */
const DOUBLE_TAP_MS = 400;

export default function Orbi({
  mood = "idle",
  size = 180,
  interactive = true,
  className = "",
}: OrbiProps) {
  /**
   * 点击互动产生的临时情绪，优先于外部传入的 mood。
   * `happy` 走 orbi-active（跳跃），`surprised` 只换表情不跳。
   */
  const [reaction, setReaction] = useState<
    "happy" | "surprised" | null
  >(null);

  const timerRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);

  // 卸载时清掉未触发的还原定时器，避免对已卸载组件 setState
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );

  const react = (kind: "happy" | "surprised") => {
    setReaction(kind);

    // 先撤掉上一个定时器：连点两次时，第一次的还原会提前打断第二次的情绪
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(
      () => setReaction(null),
      kind === "surprised" ? 900 : 650
    );
  };

  const handleClick = () => {
    if (!interactive) return;

    const now = Date.now();

    // 双击（400ms 内第二次）触发 surprised —— README 里 surprised 是
    // 「可自行扩展触发场景」，这里给它一个可点、可测的入口
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;

    lastTapRef.current = now;

    react(isDoubleTap ? "surprised" : "happy");
  };

  const currentMood = reaction ?? mood;

  return (
    <div
      className={[
        "orbi-wrapper",
        `orbi-mood-${currentMood}`,
        reaction === "happy" ? "orbi-active" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        width: size,
        height: size,
      }}
      onClick={handleClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(event) => {
        if (!interactive) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <svg
        className="orbi-svg"
        viewBox="0 0 240 240"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Orbi"
      >
        {/* Ground Glow */}
        <ellipse
          className="orbi-ground-glow"
          cx="120"
          cy="215"
          rx="65"
          ry="9"
        />

        {/* Antenna */}
        <g className="orbi-antenna">
          <path
            d="M120 48 C120 35 127 27 137 21"
            fill="none"
            stroke="var(--orbi-orange-dark)"
            strokeWidth="7"
            strokeLinecap="round"
          />

          <circle
            className="orbi-antenna-light"
            cx="139"
            cy="19"
            r="9"
            fill="var(--orbi-orange)"
          />
        </g>

        {/* Left Fin */}
        <path
          className="orbi-fin orbi-fin-left"
          d="M57 88 C37 82 28 94 31 111 C34 127 48 130 64 120 Z"
          fill="var(--orbi-orange)"
        />

        {/* Right Fin */}
        <path
          className="orbi-fin orbi-fin-right"
          d="M183 88 C203 82 212 94 209 111 C206 127 192 130 176 120 Z"
          fill="var(--orbi-orange)"
        />

        {/* Main Body */}
        <g className="orbi-body">
          <rect
            x="48"
            y="49"
            width="144"
            height="157"
            rx="62"
            fill="var(--orbi-orange)"
          />

          {/* Body Highlight */}
          <ellipse
            cx="78"
            cy="91"
            rx="17"
            ry="28"
            fill="var(--orbi-orange-light)"
            opacity="0.45"
          />

          {/* Face */}
          <rect
            x="63"
            y="78"
            width="114"
            height="88"
            rx="40"
            fill="var(--orbi-face)"
          />

          {/* Left Eye */}
          <g className="orbi-eye orbi-eye-left">
            <ellipse
              cx="94"
              cy="116"
              rx="9"
              ry="13"
              fill="var(--orbi-ink)"
            />

            <circle
              cx="97"
              cy="111"
              r="3"
              fill="#FFFFFF"
            />
          </g>

          {/* Right Eye */}
          <g className="orbi-eye orbi-eye-right">
            <ellipse
              cx="146"
              cy="116"
              rx="9"
              ry="13"
              fill="var(--orbi-ink)"
            />

            <circle
              cx="149"
              cy="111"
              r="3"
              fill="#FFFFFF"
            />
          </g>

          {/* Blush */}
          <ellipse
            className="orbi-blush"
            cx="78"
            cy="136"
            rx="10"
            ry="5"
            fill="#FFAA72"
          />

          <ellipse
            className="orbi-blush"
            cx="162"
            cy="136"
            rx="10"
            ry="5"
            fill="#FFAA72"
          />

          {/* Mouth */}
          <path
            className="orbi-mouth"
            d="M111 139 Q120 147 129 139"
            fill="none"
            stroke="var(--orbi-ink)"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Core */}
          <circle
            className="orbi-core-outer"
            cx="120"
            cy="179"
            r="9"
            fill="var(--orbi-face)"
          />

          <circle
            className="orbi-core"
            cx="120"
            cy="179"
            r="4"
            fill="var(--orbi-orange)"
          />
        </g>

        {/* Left Arm */}
        <g className="orbi-arm orbi-arm-left">
          <path
            d="M51 150 C31 157 29 177 43 184"
            fill="none"
            stroke="var(--orbi-orange)"
            strokeWidth="18"
            strokeLinecap="round"
          />
        </g>

        {/* Right Arm */}
        <g className="orbi-arm orbi-arm-right">
          <path
            d="M189 150 C209 157 211 177 197 184"
            fill="none"
            stroke="var(--orbi-orange)"
            strokeWidth="18"
            strokeLinecap="round"
          />
        </g>

        {/* Feet */}
        <ellipse
          cx="91"
          cy="204"
          rx="25"
          ry="9"
          fill="var(--orbi-orange-dark)"
        />

        <ellipse
          cx="149"
          cy="204"
          rx="25"
          ry="9"
          fill="var(--orbi-orange-dark)"
        />

        {/* Happy Effect */}
        <g className="orbi-happy-effect">
          <path
            d="M183 66 C177 58 164 64 169 74 L183 88 L197 74 C202 64 189 58 183 66Z"
            fill="#FF7A45"
          />
        </g>

        {/* Sparkle */}
        <g className="orbi-sparkle">
          <path
            d="M201 105 L205 114 L214 118 L205 122 L201 132 L197 122 L188 118 L197 114Z"
            fill="var(--orbi-orange-light)"
          />
        </g>
      </svg>
    </div>
  );
}
