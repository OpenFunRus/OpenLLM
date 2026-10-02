import type { LucideIcon } from 'lucide-react'
import {
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  FilePlus,
  FoldVertical,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
  Infinity,
  Loader2,
  MessageSquare,
  MessagesSquare,
  SlidersHorizontal,
  Monitor,
  Paperclip,
  Pencil,
  RefreshCw,
  Settings,
  Square,
  Trash2,
  Undo2,
  User,
} from 'lucide-react'

export interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

/** Cursor-style stroke: 1.25px @16, 1.5px @24 */
export function iconStroke(size: number): number {
  return size <= 16 ? 1.25 : 1.5
}

function renderIcon(
  Icon: LucideIcon,
  { size = 16, className, strokeWidth }: IconProps,
): JSX.Element {
  return (
    <Icon
      size={size}
      className={className}
      strokeWidth={strokeWidth ?? iconStroke(size)}
      aria-hidden="true"
    />
  )
}

export function IconCopy(props: IconProps): JSX.Element {
  return renderIcon(Copy, { size: 14, ...props })
}

export function IconCheck(props: IconProps): JSX.Element {
  return renderIcon(Check, { size: 14, ...props })
}

export function IconUndo(props: IconProps): JSX.Element {
  return renderIcon(Undo2, { size: 14, ...props })
}

export function IconEdit(props: IconProps): JSX.Element {
  return renderIcon(Pencil, { size: 14, ...props })
}

export function IconTrash(props: IconProps): JSX.Element {
  return renderIcon(Trash2, { size: 15, ...props })
}

export function IconChevronDown(props: IconProps): JSX.Element {
  return renderIcon(ChevronDown, { size: 10, ...props })
}

export function IconChevronRight(props: IconProps): JSX.Element {
  return renderIcon(ChevronRight, { size: 16, ...props })
}

export function IconAttach(props: IconProps): JSX.Element {
  return renderIcon(Paperclip, { size: 16, ...props })
}

export function IconSend(props: IconProps): JSX.Element {
  return renderIcon(ArrowUp, { size: 14, ...props })
}

export function IconStop({ size = 11, className }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export function IconModeAgent(props: IconProps): JSX.Element {
  return renderIcon(Infinity, { size: 12, ...props })
}

export function IconModePlan(props: IconProps): JSX.Element {
  return renderIcon(SlidersHorizontal, { size: 12, ...props })
}

export function IconModeAsk(props: IconProps): JSX.Element {
  return renderIcon(MessageSquare, { size: 12, ...props })
}

export function IconLoader(props: IconProps): JSX.Element {
  return renderIcon(Loader2, { size: 14, ...props })
}

export function IconModeChat(props: IconProps): JSX.Element {
  return renderIcon(MessagesSquare, { size: 12, ...props })
}

export function IconHistory(props: IconProps): JSX.Element {
  return renderIcon(History, { size: 16, ...props })
}

export function IconHistoryTitle(props: IconProps): JSX.Element {
  return renderIcon(MessageSquare, { size: 12, ...props })
}

export function IconHistoryCount(props: IconProps): JSX.Element {
  return renderIcon(User, { size: 12, ...props })
}

export function IconHistoryDate(props: IconProps): JSX.Element {
  return renderIcon(Calendar, { size: 12, ...props })
}

export function IconChatTab(props: IconProps): JSX.Element {
  return renderIcon(MessageSquare, { size: 14, ...props })
}

export function IconFolderOpen(props: IconProps): JSX.Element {
  return renderIcon(FolderOpen, { size: 22, ...props })
}

export function IconOpenInExplorer(props: IconProps): JSX.Element {
  return renderIcon(FolderOpen, { size: 16, ...props })
}

export function IconFiles(props: IconProps): JSX.Element {
  return renderIcon(File, { size: 22, ...props })
}

export function IconModel(props: IconProps): JSX.Element {
  return renderIcon(Monitor, { size: 22, ...props })
}

export function IconSettings(props: IconProps): JSX.Element {
  return renderIcon(Settings, { size: 22, ...props })
}

export function IconFolder(props: IconProps): JSX.Element {
  return renderIcon(Folder, { size: 16, ...props })
}

export function IconFile(props: IconProps): JSX.Element {
  return renderIcon(File, { size: 16, ...props })
}

export function IconNewFile(props: IconProps): JSX.Element {
  return renderIcon(FilePlus, { size: 16, ...props })
}

export function IconNewFolder(props: IconProps): JSX.Element {
  return renderIcon(FolderPlus, { size: 16, ...props })
}

export function IconRefresh(props: IconProps): JSX.Element {
  return renderIcon(RefreshCw, { size: 16, ...props })
}

export function IconCollapseAll(props: IconProps): JSX.Element {
  return renderIcon(FoldVertical, { size: 16, ...props })
}
