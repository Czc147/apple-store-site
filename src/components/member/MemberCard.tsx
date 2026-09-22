import { CARD_STYLE_LABEL, type CardStyle } from '@/lib/types';
import { formatExpiry } from '@/lib/format';
import { cn } from '@/lib/cn';

interface MemberCardProps {
  /** 卡档位：silver 银 / gold 金 / black 黑金（后台按订阅产品配置） */
  variant: CardStyle;
  /** 卡中心的大文本（后台可编辑；没填时由调用方退回订阅名） */
  text: string;
  /** 到期时间（ISO）；null / 省略 = 永久有效 */
  expiresAt?: string | null;
  className?: string;
}

/**
 * 会员卡（需求1）。纯展示组件，三处复用：我的库、我的券，以后别处也能用。
 *
 * 设计取自用户给的三张参考图：左上 Zorvin 标识、右上 MEMBER CARD 标签+短横线、
 * 中间大片留白放大文本、两条交叉弧线加交点高光、卡外一圈同色辉光。
 *
 * 几处刻意的落地调整：
 * - 中心大文本用**真实 HTML** 而不是 SVG <text>：能直接吃站点的字阶 token
 *   （text-2xl / sm:text-editorial-title）、可被选中、后台改文案即时反映。
 * - 圆角取站点 token `rounded-hero`(28px)，不照搬参考图比例 ——
 *   参考图是 1512px 宽的独立海报，等比缩到手机宽度后圆角会小得看不出来。
 * - 外圈辉光压得很淡：页面底色是浅雾灰，辉光重了显脏也会抢焦点。
 * - 配色全部走 globals.css 的 [data-variant] 变量，组件里不散落色值。
 */
export default function MemberCard({
  variant,
  text,
  expiresAt,
  className,
}: MemberCardProps) {
  return (
    <div
      className={cn('member-card rounded-hero', className)}
      data-variant={variant}
      role="img"
      aria-label={`${CARD_STYLE_LABEL[variant]}会员卡${text ? ` · ${text}` : ''} · ${
        expiresAt ? `有效期至 ${formatExpiry(expiresAt)}` : '永久有效'
      }`}
    >
      {/* 装饰弧线层：两条交叉曲线 + 交点高光（纯装饰，对读屏隐藏） */}
      <svg
        className="member-card__swoosh"
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
        aria-hidden
      >
        {/* 主弧线：从左缘上段向右下扫到底边 */}
        <path
          d="M-6 70 C 68 78, 132 100, 186 138 C 228 166, 262 182, 310 196"
          fill="none"
          stroke="var(--mc-line)"
          strokeWidth="1.1"
        />
        {/* 副弧线：从左下向右上，与主弧线在**右下**交叉 ——
            参考图里交点在正中，但那是因为它中间是空的；我们的卡中心要放大文本，
            交点压上去会跟字打架，所以刻意把它挪到右下 */}
        <path
          d="M-6 176 C 84 170, 164 150, 216 120 C 252 98, 278 76, 310 58"
          fill="none"
          stroke="var(--mc-line)"
          strokeWidth="1"
        />
        {/* 交点高光 */}
        <circle cx="188" cy="140" r="9" fill="var(--mc-spark)" />
        <circle cx="188" cy="140" r="2.6" fill="var(--mc-line)" />
      </svg>

      <div className="relative flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-lg font-semibold sm:text-xl">
            <ZorvinMark className="h-[18px] w-[22px]" />
            Zorvin
          </span>
          <span className="member-card__label border-b border-current pb-1.5 text-micro font-semibold">
            MEMBER CARD
          </span>
        </div>

        {/* 卡面大文本：吃站点字阶，居中 */}
        <div className="flex flex-1 items-center justify-center px-1">
          {text && (
            <p className="text-center text-2xl font-semibold leading-tight sm:text-editorial-title">
              {text}
            </p>
          )}
        </div>

        <p className="member-card__expiry text-micro font-medium">
          {expiresAt ? `有效期至 ${formatExpiry(expiresAt)}` : '永久有效'}
        </p>
      </div>
    </div>
  );
}

/**
 * Zorvin 标识：三条右倾平行四边形（中间一条最亮，上下两条淡，做出速度感）。
 * 项目现有的 `src/app/icon.svg` 是个购物袋 PWA 图标，跟卡上标识不是一回事，未复用。
 */
export function ZorvinMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 30 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.2 4.1 24.4 0H30L11.8 4.1H6.2Z" opacity="0.55" />
      <path d="M0 14.9 18.2 5.8H23.8L5.6 14.9H0Z" />
      <path d="M6.2 20.7 24.4 11.6H30L11.8 20.7H6.2Z" opacity="0.55" />
    </svg>
  );
}
