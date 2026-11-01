export const REACTIONS = [
  { key: "heart", emoji: "❤️", label: "ハート" },
  { key: "fire", emoji: "🔥", label: "炎" },
  { key: "hundred", emoji: "💯", label: "100点" },
  { key: "clap", emoji: "👏", label: "拍手" },
  { key: "sparkles", emoji: "✨", label: "キラキラ" },
  { key: "cry", emoji: "😭", label: "泣ける" },
  { key: "laugh", emoji: "😂", label: "笑った" },
  { key: "pray", emoji: "🙏", label: "ありがたい" },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]["key"];
export const REACTION_KEYS = REACTIONS.map((r) => r.key) as [
  ReactionKind,
  ...ReactionKind[],
];
export const MAX_REACTIONS = 5;
export const DEFAULT_REACTIONS: ReactionKind[] = ["heart", "fire", "hundred"];
export const reactionOf = (key: string) => REACTIONS.find((r) => r.key === key);
