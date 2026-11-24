import type { LucideIcon } from "lucide-react";
// Per-icon entry points keep the bundle (and the Workers test runtime) to the icons actually used.
import Archive from "lucide-react/icons/archive";
import ArrowDown from "lucide-react/icons/arrow-down";
import ArrowUp from "lucide-react/icons/arrow-up";
import ArrowUpRight from "lucide-react/icons/arrow-up-right";
import Bell from "lucide-react/icons/bell";
import Calendar from "lucide-react/icons/calendar";
import CalendarDays from "lucide-react/icons/calendar-days";
import ChartColumn from "lucide-react/icons/chart-column";
import ChartGantt from "lucide-react/icons/chart-gantt";
import Check from "lucide-react/icons/check";
import ChevronDown from "lucide-react/icons/chevron-down";
import ChevronLeft from "lucide-react/icons/chevron-left";
import ChevronRight from "lucide-react/icons/chevron-right";
import ChevronsUpDown from "lucide-react/icons/chevrons-up-down";
import Circle from "lucide-react/icons/circle";
import CircleCheck from "lucide-react/icons/circle-check";
import CircleDashed from "lucide-react/icons/circle-dashed";
import CircleDot from "lucide-react/icons/circle-dot";
import CircleDotDashed from "lucide-react/icons/circle-dot-dashed";
import CirclePause from "lucide-react/icons/circle-pause";
import CircleX from "lucide-react/icons/circle-x";
import Clock from "lucide-react/icons/clock";
import Command from "lucide-react/icons/command";
import Copy from "lucide-react/icons/copy";
import CornerDownLeft from "lucide-react/icons/corner-down-left";
import Ellipsis from "lucide-react/icons/ellipsis";
import Eye from "lucide-react/icons/eye";
import Flag from "lucide-react/icons/flag";
import Folder from "lucide-react/icons/folder";
import FolderKanban from "lucide-react/icons/folder-kanban";
import Globe from "lucide-react/icons/globe";
import Hash from "lucide-react/icons/hash";
import History from "lucide-react/icons/history";
import House from "lucide-react/icons/house";
import Inbox from "lucide-react/icons/inbox";
import Kanban from "lucide-react/icons/kanban";
import Layers from "lucide-react/icons/layers";
import LayoutList from "lucide-react/icons/layout-list";
import Link from "lucide-react/icons/link";
import ListFilter from "lucide-react/icons/list-filter";
import ListTree from "lucide-react/icons/list-tree";
import Loader from "lucide-react/icons/loader";
import LogOut from "lucide-react/icons/log-out";
import MessageSquare from "lucide-react/icons/message-square";
import Minus from "lucide-react/icons/minus";
import Moon from "lucide-react/icons/moon";
import OctagonAlert from "lucide-react/icons/octagon-alert";
import PanelLeft from "lucide-react/icons/panel-left";
import Paperclip from "lucide-react/icons/paperclip";
import Pencil from "lucide-react/icons/pencil";
import Plus from "lucide-react/icons/plus";
import RotateCcw from "lucide-react/icons/rotate-ccw";
import Search from "lucide-react/icons/search";
import Settings from "lucide-react/icons/settings";
import SignalHigh from "lucide-react/icons/signal-high";
import SignalLow from "lucide-react/icons/signal-low";
import SignalMedium from "lucide-react/icons/signal-medium";
import SlidersHorizontal from "lucide-react/icons/sliders-horizontal";
import SquareCheck from "lucide-react/icons/square-check";
import Sun from "lucide-react/icons/sun";
import Tag from "lucide-react/icons/tag";
import Target from "lucide-react/icons/target";
import ThumbsDown from "lucide-react/icons/thumbs-down";
import ThumbsUp from "lucide-react/icons/thumbs-up";
import Trash2 from "lucide-react/icons/trash-2";
import TriangleAlert from "lucide-react/icons/triangle-alert";
import Upload from "lucide-react/icons/upload";
import User from "lucide-react/icons/user";
import UserPlus from "lucide-react/icons/user-plus";
import Users from "lucide-react/icons/users";
import X from "lucide-react/icons/x";
import Zap from "lucide-react/icons/zap";
import type { CSSProperties, SVGProps } from "react";

/** Lucide names available to the PTM design system. */
export const ICON_NAMES = [
  "archive",
  "arrow-down",
  "arrow-up",
  "arrow-up-right",
  "bell",
  "calendar",
  "calendar-days",
  "chart-column",
  "chart-gantt",
  "check",
  "chevron-down",
  "chevron-left",
  "chevron-right",
  "chevrons-up-down",
  "circle",
  "circle-check",
  "circle-dashed",
  "circle-dot",
  "circle-dot-dashed",
  "circle-pause",
  "circle-x",
  "clock",
  "command",
  "copy",
  "corner-down-left",
  "ellipsis",
  "eye",
  "flag",
  "folder",
  "folder-kanban",
  "globe",
  "hash",
  "history",
  "house",
  "inbox",
  "kanban",
  "layers",
  "layout-list",
  "link",
  "list-filter",
  "list-tree",
  "loader",
  "log-out",
  "message-square",
  "minus",
  "moon",
  "octagon-alert",
  "panel-left",
  "paperclip",
  "pencil",
  "plus",
  "rotate-ccw",
  "search",
  "settings",
  "signal-high",
  "signal-low",
  "signal-medium",
  "sliders-horizontal",
  "square-check",
  "sun",
  "tag",
  "target",
  "thumbs-down",
  "thumbs-up",
  "trash-2",
  "triangle-alert",
  "upload",
  "user",
  "user-plus",
  "users",
  "x",
  "zap",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Lucide icons used by the PTM design system, keyed by their Lucide name. */
const ICONS: Record<IconName, LucideIcon> = {
  archive: Archive,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  calendar: Calendar,
  "calendar-days": CalendarDays,
  "chart-column": ChartColumn,
  "chart-gantt": ChartGantt,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevrons-up-down": ChevronsUpDown,
  circle: Circle,
  "circle-check": CircleCheck,
  "circle-dashed": CircleDashed,
  "circle-dot": CircleDot,
  "circle-dot-dashed": CircleDotDashed,
  "circle-pause": CirclePause,
  "circle-x": CircleX,
  clock: Clock,
  command: Command,
  copy: Copy,
  "corner-down-left": CornerDownLeft,
  ellipsis: Ellipsis,
  eye: Eye,
  flag: Flag,
  folder: Folder,
  "folder-kanban": FolderKanban,
  globe: Globe,
  hash: Hash,
  history: History,
  house: House,
  inbox: Inbox,
  kanban: Kanban,
  layers: Layers,
  "layout-list": LayoutList,
  link: Link,
  "list-filter": ListFilter,
  "list-tree": ListTree,
  loader: Loader,
  "log-out": LogOut,
  "message-square": MessageSquare,
  minus: Minus,
  moon: Moon,
  "octagon-alert": OctagonAlert,
  "panel-left": PanelLeft,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  "rotate-ccw": RotateCcw,
  search: Search,
  settings: Settings,
  "signal-high": SignalHigh,
  "signal-low": SignalLow,
  "signal-medium": SignalMedium,
  "sliders-horizontal": SlidersHorizontal,
  "square-check": SquareCheck,
  sun: Sun,
  tag: Tag,
  target: Target,
  "thumbs-down": ThumbsDown,
  "thumbs-up": ThumbsUp,
  "trash-2": Trash2,
  "triangle-alert": TriangleAlert,
  upload: Upload,
  user: User,
  "user-plus": UserPlus,
  users: Users,
  x: X,
  zap: Zap,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref" | "name"> {
  name: IconName;
  /** Pixel size; 14 in rows and badges, 15–16 in buttons and the sidebar */
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Accessible title; when omitted the icon is decorative */
  title?: string;
  style?: CSSProperties;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  color = "currentColor",
  title,
  style,
  ...rest
}: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      style={{ flexShrink: 0, display: "block", ...style }}
      {...rest}
    />
  );
}
