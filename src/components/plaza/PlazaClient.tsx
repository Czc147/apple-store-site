'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  MessageCircle,
  MessagesSquare,
  Search,
  Settings,
  Share2,
  ShoppingBasket,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';
import { fetchMyProfile, type MyProfile } from '@/lib/user-profile';
import { useDmUnread } from '@/lib/dm-unread-store';
import Avatar from '@/components/ui/Avatar';
import IconButton from '@/components/ui/IconButton';
import CountBadge from '@/components/ui/CountBadge';
import CommunityClient from '@/components/community/CommunityClient';
import Orbi from '@/components/orbi/Orbi';
import LiquidTabBar, { type LiquidTabItem } from '@/components/layout/LiquidTabBar';
import DmBoard from './DmBoard';
import SettingsScreen from './SettingsScreen';
import SearchPanel from './SearchPanel';
import ShareBoard from './ShareBoard';
import GroupBuyBoard from './GroupBuyBoard';

/** 进入广场时的加载动画时长（循环动画本身无限播，这只是"转场"时长） */
const ENTER_MS = 1400;

type BoardKey = 'chat' | 'share' | 'group' | 'dm';

interface Board {
  key: BoardKey;
  label: string;
  icon: LucideIcon;
  /** 板块上方的标题（用户指定文案） */
  title: string;
  subtitle: string;
}

const BOARDS: Board[] = [
  {
    key: 'chat',
    label: '交流',
    icon: MessagesSquare,
    title: '认识更多的朋友',
    subtitle: '发帖分享你的近况，也能看看别人在聊什么。',
  },
  {
    key: 'share',
    label: '共享',
    icon: Share2,
    title: '公平分享你的资源',
    subtitle: '用你的资源换你需要的小单元，双方确认后各自解锁。',
  },
  {
    key: 'group',
    label: '一起买',
    icon: ShoppingBasket,
    title: '一起买，更划算',
    subtitle: '发起拼单，人满开团，每人只付分摊后的价格。',
  },
  {
    key: 'dm',
    label: '对话',
    icon: MessageCircle,
    title: '对话',
    subtitle: '和好友聊天，也可以直接给官方留言。',
  },
];

/**
 * 探究广场（2026-09-22 用户需求）。
 *
 * 结构：顶部返回 + 板块标题 → 板块内容 → 底部五板块栏。
 * - **返回**：用户没讲怎么退出广场，这里补了左上角返回（回「探究」）。
 *   没有出口的整屏界面是死路，必须有一个。
 * - **搜索**按用户要求做成**圆形胶囊 + 放大镜**，跟其余四个文字 Tab 形态不同，
 *   点击开搜索面板而不是切板块。
 * - 板块切换用页内状态而非子路由：用户描述的是"一个界面里切板块"。
 * - 进入时播一次加载动画（循环旋转），转场感来自这一步而不是骨架屏 ——
 *   广场首次进入要拉的数据以后会变多，先把这个过渡做出来。
 */
export default function PlazaClient({ version }: { version: string }) {
  const { user, getAuthHeaders } = useAuth();
  const [entering, setEntering] = useState(true);
  const [board, setBoard] = useState<BoardKey>('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  /** 会话视图打开时收起广场标题栏与外层返回（见 DmBoard 的 onFullscreenChange） */
  const [fullscreen, setFullscreen] = useState(false);
  /** 自己的名片（右上角头像用）。Supabase 的 user 上没有昵称/头像，得单独取一次 */
  const [me, setMe] = useState<MyProfile | null>(null);
  /** 总设置（齿轮） */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /**
   * 去对话板块时要**直达**哪个视图。
   * 「我的收藏」住在对话板块里，设置页点它不能只切到对话就算完 ——
   * 用户还得多点一次收藏入口，等于没跳。所以把意图带过去。
   */
  const [dmIntent, setDmIntent] = useState<'bookmarks' | null>(null);

  useEffect(() => {
    if (!user) {
      setMe(null);
      return;
    }
    let alive = true;
    void fetchMyProfile(getAuthHeaders).then((p) => {
      if (alive) setMe(p);
    });
    return () => {
      alive = false;
    };
  }, [user, getAuthHeaders]);

  /**
   * 带定位的 hash 一律落到对应板块：
   * `#post-<id>` → 交流 · `#group-<id>` → 一起买。
   *
   * 从广场**内部**点这些链接时（收藏里的原帖、主页的拼单），地址路径与当前页
   * 完全相同，浏览器判定为**同文档导航**：整页不会重载，`board` 也就一直停在
   * 原来的板块上，目标板块根本没挂载，点起来像没反应（用户报的"依旧点击没有反应"）。
   *
   * 所以广场自己接住 hash 切板块；滚动与高亮交给目标板块自己那段
   * "取数后再定位"的逻辑（它们只在挂载拿到数据后才会滚）。
   * 冷启动直达时也走这里 —— 首屏本来就在交流，无害。
   */
  useEffect(() => {
    const boardForHash = (hash: string): BoardKey | null => {
      if (/^#post-/.test(hash)) return 'chat';
      if (/^#group-/.test(hash)) return 'group';
      return null;
    };
    const sync = () => {
      const next = boardForHash(window.location.hash);
      if (next) setBoard(next);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  // 减弱动效：跨项弹动与按压彩虹都关掉（与主 TabBar 同口径）
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setEntering(false), ENTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  const current = BOARDS.find((b) => b.key === board) ?? BOARDS[0];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 顶栏：左＝返回探究（广场是整屏界面，必须留出口），右＝我的头像。
          头像放这里而不是对话板块里再写一行「我的主页」文字 —— 用户指出那行
          文字压在板块标题下面，既重复又占位；头像在右上角一眼就认识，
          且四个板块都能用（它是"我"的入口，不是对话板块的附属）。
          会话视图打开时整条让位：那条路径自己有返回按钮，且要占满一屏。 */}
      {!fullscreen && (
        <div className="px-page pt-3">
          <div className="mx-auto flex max-w-wide items-center justify-between gap-3">
            <Link
              href="/community"
              className="-ml-2 inline-flex items-center gap-0.5 rounded-btn py-2 pl-1 pr-3 text-sm font-medium text-apple-text-2 transition-colors duration-fast ease-apple hover:text-apple-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              探究
            </Link>

            <div className="flex flex-none items-center">
              {/* 用站点的 IconButton 而不是手写一个 button：命中区 44×44、
                  按压走 .pressable-soft、图标尺寸档，都是现成的规约 */}
              <IconButton
                icon={Settings}
                label="总设置"
                onClick={() => setSettingsOpen(true)}
              />

              {user && (
                <Link
                  href={`/u/${user.id}`}
                  aria-label="我的主页"
                  title="我的主页"
                  /* 头像视觉 32px，命中区撑到 44（同 IconButton 的手法）；
                     -mr-2 把多出来的 6px 让回给右边距，头像仍贴着右上角 */
                  className="pressable-soft -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-apple-blue/40"
                >
                  <Avatar
                    avatarKey={me?.avatar_key}
                    avatarUrl={me?.avatar_url}
                    name={me?.display_name}
                    size={32}
                  />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {entering ? (
        <PlazaLoader />
      ) : (
        <>
          {!fullscreen && (
            <header className="px-page pb-7 pt-4">
              <div className="mx-auto max-w-wide">
                <h1 className="text-2xl font-semibold leading-[1.15] text-apple-text sm:text-editorial-title">
                  {current.title}
                </h1>
                <p className="mt-2 max-w-[640px] text-md leading-relaxed text-apple-text-2">
                  {current.subtitle}
                </p>
              </div>
            </header>
          )}

          <div className={cn('flex-1', fullscreen ? '' : 'px-page')}>
            {/* 交流板块 = 原社区帖子流（用户拍板：帖子流整个搬到广场）。
                发帖支持图文，配图见迁移 024 */}
            {current.key === 'chat' ? (
              <div className="mx-auto max-w-wide">
                <CommunityClient />
              </div>
            ) : current.key === 'dm' ? (
              <DmBoard
                onFullscreenChange={setFullscreen}
                intent={dmIntent}
                onIntentHandled={() => setDmIntent(null)}
              />
            ) : current.key === 'share' ? (
              <ShareBoard />
            ) : current.key === 'group' ? (
              <GroupBuyBoard />
            ) : (
              <div className="px-page">
                <BoardPlaceholder board={current} />
              </div>
            )}
          </div>
        </>
      )}

      <PlazaBar
        board={board}
        onBoard={setBoard}
        onSearch={() => setSearchOpen(true)}
        searchOpen={searchOpen}
        reducedMotion={reducedMotion}
      />

      {searchOpen && (
        <SearchPanel
          onClose={() => setSearchOpen(false)}
          onGoBoard={(key) => {
            // 从搜索结果跳到某个板块：先切板块再收面板，
            // 否则用户会看到面板底下先闪一下旧板块
            setBoard(key);
            setSearchOpen(false);
          }}
        />
      )}

      {settingsOpen && (
        <SettingsScreen
          version={version}
          me={me}
          onClose={() => setSettingsOpen(false)}
          onOpenBookmarks={() => {
            // 设置页让位，落到对话板块的收藏视图（见 dmIntent 注释）
            setSettingsOpen(false);
            setDmIntent('bookmarks');
            setBoard('dm');
          }}
        />
      )}
    </div>
  );
}

/**
 * 进入加载：用 Orbi 自己当加载动画（用户要求"加载动画用小机器人动画"）。
 *
 * 不另外画转圈：Orbi 的 idle 就带着漂浮/眨眼/天线摆动/核心灯呼吸，
 * 这些本来就是循环动画，直接拿来当 loading 比一个圈更贴合 IP，
 * 也不用维护第二套动效。mood 取 thinking —— 天线灯闪得更快，
 * 读起来就是"它在忙"。interactive 关掉：这是过场，不该被点出 happy 跳。
 */
function PlazaLoader() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-page pb-24"
      role="status"
      aria-live="polite"
    >
      <Orbi size={140} mood="thinking" interactive={false} />
      <p className="text-sm text-apple-text-2">正在进入探究广场</p>
    </div>
  );
}

/** 板块内容占位：四个板块的真实内容分批实装，先把结构与文案立住 */
function BoardPlaceholder({ board }: { board: Board }) {
  return (
    <div className="mx-auto max-w-wide">
      <div className="rounded-card-lg border border-apple-border bg-apple-card px-5 py-14 text-center shadow-card">
        <p className="text-md font-medium text-apple-text">{board.title}</p>
        <p className="mx-auto mt-1.5 max-w-[420px] text-sm leading-relaxed text-apple-text-2">
          {board.subtitle}
        </p>
        <p className="mt-4 text-2xs text-apple-text-3">该板块正在开发中</p>
      </div>
    </div>
  );
}

/** 底部五板块栏：四个文字 Tab + 一个圆形搜索胶囊。
 *
 * 直接复用主 TabBar 那套 `LiquidTabBar` —— 用户指出广场底部"为什么不和
 * 第一个页面统一"，所以药丸、玻璃罩、跨项弹动、按压彩虹全部走同一个组件，
 * 而不是在这里另写一份长得像的。 */
function PlazaBar({
  board,
  onBoard,
  onSearch,
  searchOpen,
  reducedMotion,
}: {
  board: BoardKey;
  onBoard: (next: BoardKey) => void;
  onSearch: () => void;
  searchOpen: boolean;
  reducedMotion: boolean;
}) {
  // 私信未读 → 「对话」按钮上的红点（用户 2026-09-22 要求）。
  // 人在交流/共享/一起买板块时看不到会话行，没有这个点就完全不知道有人找。
  const { unread: dmUnread } = useDmUnread();

  const items: LiquidTabItem[] = BOARDS.map(({ key, label, icon }) => ({
    key,
    label,
    icon,
    onClick: () => onBoard(key),
    badge: key === 'dm' && dmUnread > 0 ? <CountBadge key={dmUnread} count={dmUnread} /> : null,
  }));

  return (
    <LiquidTabBar
      items={items}
      // 搜索面板打开时取消激活态 —— 罩收起来，别停在某个板块上误导人
      activeKey={searchOpen ? null : board}
      ariaLabel="广场板块"
      reducedMotion={reducedMotion}
      action={{
        label: '搜索',
        icon: Search,
        onClick: onSearch,
        active: searchOpen,
      }}
    />
  );
}

