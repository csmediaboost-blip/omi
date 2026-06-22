export type LiveActivity = {
  id: number;
  user: string;
  action: string;
  amount?: string;
  time: number;
};

const names = [
  "john",
  "sarah",
  "alex",
  "mark",
  "david",
  "linda",
  "steve",
  "lucas",
  "emma",
  "james",
  "oliver",
  "mason",
  "logan",
  "mia",
  "ava",
  "noah",
  "ethan",
  "isabella",
  "liam",
  "amelia",
  "harper",
  "charlotte",
  "elijah",
  "daniel",
  "henry",
  "jack",
  "leo",
  "sebastian",
];

const actions = [
  "completed AI image labeling task",
  "earned reward",
  "withdrawn earnings",
  "completed video moderation task",
  "completed voice transcription",
  "joined OmniTask Pro",
  "reached Silver tier",
  "reached Gold tier",
  "reached Diamond tier",
  "completed dataset tagging",
  "earned referral bonus",
  "completed micro task batch",
];

function maskUser(name: string) {
  return `${name.slice(0, 3)}***${Math.floor(Math.random() * 99)}`;
}

function randomAmount() {
  return (Math.random() * 50 + 2).toFixed(2);
}

export function generateActivities(count = 80) {
  const activities: LiveActivity[] = [];

  for (let i = 0; i < count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];

    activities.push({
      id: i,
      user: maskUser(name),
      action: actions[Math.floor(Math.random() * actions.length)],
      amount: randomAmount(),
      time: Math.floor(Math.random() * 60),
    });
  }

  return activities;
}
