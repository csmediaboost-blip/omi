export interface Activity {
  id: string;
  type: 'tier_upgrade' | 'earnings' | 'task_completed' | 'referral' | 'milestone' | 'certification';
  user: {
    name: string;
    id: string;
  };
  title: string;
  description: string;
  amount?: number;
  timestamp: Date;
  icon: string;
}

const firstNames = ['Alex', 'Jordan', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Riley', 'Avery', 'Jamie', 'Sam', 'Chris', 'Dana', 'Blake', 'Dylan', 'Ellis'];
const lastNames = ['Anderson', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Moore'];

const taskTitles = [
  'Classify Product Images',
  'Evaluate AI Chatbot',
  'Content Moderation Review',
  'Data Annotation Task',
  'Audio Transcription',
  'Survey Response Analysis',
  'Text Classification',
  'Image Labeling Project',
  'Customer Feedback Review',
  'Quality Assurance Testing',
  'Document Verification',
  'Language Translation',
  'Code Review Analysis',
  'Sentiment Analysis Task',
  'Entity Recognition Project',
];

const companies = ['DataFlow AI', 'VoiceSync Labs', 'SentimentAI', 'NeuralNet Inc', 'ContentPro', 'TruthSeek', 'ChatMaster AI', 'ShopFlow', 'DevQuality', 'MediDoc AI'];

const tiers = ['Bronze', 'Silver', 'Gold', 'Diamond'];

function generateRandomId() {
  return Math.random().toString(36).substr(2, 9);
}

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomName() {
  return `${getRandomItem(firstNames)} ${getRandomItem(lastNames)}`;
}

function getRandomAmount() {
  return Math.floor(Math.random() * (200 - 5 + 1) + 5);
}

function getRandomTime() {
  const minutes = Math.floor(Math.random() * 120); // Last 2 hours
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date;
}

export function generateActivities(): Activity[] {
  const activities: Activity[] = [];

  // Tier upgrades
  for (let i = 0; i < 8; i++) {
    activities.push({
      id: generateRandomId(),
      type: 'tier_upgrade',
      user: { name: getRandomName(), id: generateRandomId() },
      title: `User upgraded to ${getRandomItem(tiers)} tier`,
      description: `Started earning higher rewards and exclusive benefits`,
      timestamp: getRandomTime(),
      icon: '✨',
    });
  }

  // Task completions
  for (let i = 0; i < 12; i++) {
    const amount = getRandomAmount();
    activities.push({
      id: generateRandomId(),
      type: 'task_completed',
      user: { name: getRandomName(), id: generateRandomId() },
      title: `Completed ${getRandomItem(taskTitles)}`,
      description: `Earned $${amount} for completing the task`,
      amount,
      timestamp: getRandomTime(),
      icon: '✅',
    });
  }

  // Earnings/Commissions
  for (let i = 0; i < 10; i++) {
    const amount = Math.floor(Math.random() * 150 + 15);
    activities.push({
      id: generateRandomId(),
      type: 'earnings',
      user: { name: getRandomName(), id: generateRandomId() },
      title: `Commission earned`,
      description: `$${amount} commission received from referral earnings`,
      amount,
      timestamp: getRandomTime(),
      icon: '💰',
    });
  }

  // Referral signups
  for (let i = 0; i < 7; i++) {
    activities.push({
      id: generateRandomId(),
      type: 'referral',
      user: { name: getRandomName(), id: generateRandomId() },
      title: `New referral signup`,
      description: `Successfully referred a new user to the platform`,
      timestamp: getRandomTime(),
      icon: '🎯',
    });
  }

  // Milestone achievements
  for (let i = 0; i < 6; i++) {
    const milestones = [
      '10 tasks completed',
      '50 tasks completed',
      '100 tasks completed',
      '$500 earned',
      '$1000 earned',
      '5 referrals',
    ];
    activities.push({
      id: generateRandomId(),
      type: 'milestone',
      user: { name: getRandomName(), id: generateRandomId() },
      title: `Milestone achieved: ${getRandomItem(milestones)}`,
      description: `Unlocked new achievements and benefits`,
      timestamp: getRandomTime(),
      icon: '🏆',
    });
  }

  // Certifications
  for (let i = 0; i < 8; i++) {
    const certs = [
      'Data Labeling Expert',
      'Quality Assurance Certified',
      'Content Moderation Specialist',
      'AI Training Professional',
      'Advanced Annotator',
      'Premium Contributor',
      'Elite Performer',
      'Master Trainer',
    ];
    activities.push({
      id: generateRandomId(),
      type: 'certification',
      user: { name: getRandomName(), id: generateRandomId() },
      title: `New certification: ${getRandomItem(certs)}`,
      description: `Completed verification and earned new badge`,
      timestamp: getRandomTime(),
      icon: '🎓',
    });
  }

  // Sort by timestamp descending
  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
