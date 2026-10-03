/**
 * Hub tiles configuration — single source of truth for the /explore hub,
 * the mobile bottom-tab bar, and any other nav that surfaces the main
 * learning surfaces. Adding a new surface means adding a row here and
 * nothing else.
 *
 * Fields:
 *   - id: stable key
 *   - title: shown on the tile and tab bar
 *   - desc: one-line description on the tile (hidden on tab bar)
 *   - iconId: key into ICONS so this config stays serializable + tree-
 *     shake friendly. Inline SVGs live in `components/ui/icons.tsx`.
 *   - href: where the tile takes you
 *   - tabOrder: index in the mobile bottom tab bar (1-5). Omit to hide.
 *   - accent: tile accent class — uses only CSS tokens, no hex.
 *   - adminOnly: hidden unless the session user has role 'admin'
 *   - extras: optional per-tile add-ons (difficulty chips, progress bar, etc.)
 */

import type { ComponentType } from 'react';
import {
  FlashcardsIcon,
  QuizIcon,
  PassageIcon,
  VocabIcon,
  GrammarIcon,
  ExamIcon,
  ProgressIcon,
  SettingsIcon,
  AdminIcon,
  type IconProps,
} from '@/components/ui/icons';

export type TileIconId =
  | 'flashcards'
  | 'quiz'
  | 'passage'
  | 'vocab'
  | 'grammar'
  | 'exam'
  | 'progress'
  | 'settings'
  | 'admin';

/** Map from a stable id to the icon component. Keeps the config
 *  serializable so it could move to a CMS later without bundling React
 *  components. The component is rendered with default props. */
export const ICONS: Record<TileIconId, ComponentType<IconProps>> = {
  flashcards: FlashcardsIcon,
  quiz: QuizIcon,
  passage: PassageIcon,
  vocab: VocabIcon,
  grammar: GrammarIcon,
  exam: ExamIcon,
  progress: ProgressIcon,
  settings: SettingsIcon,
  admin: AdminIcon,
};

export type TileExtras =
  | { kind: 'progress'; /** 0-100. Real value comes from real data, see useProgress. */ value: number }
  | { kind: 'chips'; chips: Array<{ label: string; onClick?: () => void }> };

export type HubTile = {
  id: string;
  title: string;
  desc: string;
  iconId: TileIconId;
  href: string;
  tabOrder?: number;
  accent?: 'accent' | 'primary' | 'success' | 'warning' | 'danger';
  /** Hidden unless the session user has role 'admin'. */
  adminOnly?: boolean;
  extras?: TileExtras;
};

export const HUB_TILES: HubTile[] = [
  {
    id: 'flashcards',
    title: 'Flashcards',
    desc: 'Spaced-repetition decks that adapt to you.',
    iconId: 'flashcards',
    href: '/flashcards',
    tabOrder: 1,
    accent: 'accent',
    extras: { kind: 'progress', value: 0 },
  },
  {
    id: 'quiz',
    title: 'MCQ Quiz',
    desc: 'Smart adaptive questions on any topic.',
    iconId: 'quiz',
    href: '/quiz',
    tabOrder: 2,
    accent: 'primary',
    extras: { kind: 'chips', chips: [
      { label: 'Easy' },
      { label: 'Hard' },
    ] },
  },
  {
    id: 'quiz-from-passage',
    title: 'Quiz from passage',
    desc: 'Paste a text and AI generates comprehension questions.',
    iconId: 'passage',
    href: '/quiz/from-passage',
    accent: 'accent',
  },
  {
    id: 'vocab',
    title: 'Vocabulary',
    desc: 'Authored word lists with examples.',
    iconId: 'vocab',
    href: '/vocab',
    tabOrder: 3,
    accent: 'accent',
  },
  {
    id: 'grammar',
    title: 'Grammar',
    desc: 'Curated explanations by CEFR level.',
    iconId: 'grammar',
    href: '/grammar',
    accent: 'accent',
  },
  {
    id: 'exam',
    title: 'Exam',
    desc: 'Timed mini-mock with a real verdict.',
    iconId: 'exam',
    href: '/exam',
    accent: 'warning',
  },
  {
    id: 'progress',
    title: 'Progress',
    desc: 'Your accuracy, streaks, and weak spots.',
    iconId: 'progress',
    href: '/progress',
    accent: 'success',
  },
  {
    id: 'settings',
    title: 'Settings',
    desc: 'AI explanations, theme, and per-user toggles.',
    iconId: 'settings',
    href: '/settings',
    accent: 'accent',
  },
  {
    id: 'admin',
    title: 'Admin',
    desc: 'Feature flags, rate-limit overrides, AI cache.',
    iconId: 'admin',
    href: '/admin',
    adminOnly: true,
    accent: 'danger',
  },
];

/** The five tiles that surface in the mobile bottom bar. */
export const TAB_TILES = (isAdmin: boolean): HubTile[] =>
  HUB_TILES
    .filter((t) => t.tabOrder !== undefined && (!t.adminOnly || isAdmin))
    .sort((a, b) => (a.tabOrder! - b.tabOrder!));

/** The grid tiles — excludes anything that's only in the tab bar. */
export const GRID_TILES = (isAdmin: boolean): HubTile[] =>
  HUB_TILES.filter((t) => !t.adminOnly || isAdmin);

/**
 * Tile accent → Tailwind class. All values come from CSS tokens so
 * dark mode + theme swap work without code changes.
 */
export const TILE_ACCENT: Record<NonNullable<HubTile['accent']>, string> = {
  accent: 'border-accent/30 bg-accent/10 text-accent',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
};