export type Task = {
  id: number;
  title: string;
  reward: number;
  tier_required: string;
  slots: number;
};

export const tasks: Task[] = [
  {
    id: 1,
    title: "AI Image Labeling",
    reward: 4.5,
    tier_required: "bronze",
    slots: 23,
  },

  {
    id: 2,
    title: "Voice Transcription",
    reward: 7.2,
    tier_required: "silver",
    slots: 12,
  },

  {
    id: 3,
    title: "Video Moderation",
    reward: 12.5,
    tier_required: "silver",
    slots: 7,
  },

  {
    id: 4,
    title: "Medical Data Tagging",
    reward: 25,
    tier_required: "gold",
    slots: 4,
  },

  {
    id: 5,
    title: "Autonomous Vehicle Dataset",
    reward: 60,
    tier_required: "diamond",
    slots: 2,
  },
];
