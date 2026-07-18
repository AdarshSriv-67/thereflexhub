export interface TestMeta {
  id: string;
  href: string;
  title: string;
  hook: string;
  category: 'reaction' | 'clicking' | 'typing' | 'brain' | 'aim' | 'puzzle';
  /** Inline SVG inner markup, drawn on a 24x24 grid with stroke=currentColor */
  icon: string;
}

const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

export const tests: TestMeta[] = [
  {
    id: 'reaction',
    href: '/reaction-time-test',
    title: 'Reaction Time Test',
    hook: 'Click when red turns green. The average human takes 273 ms.',
    category: 'reaction',
    icon: `<path ${S} d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z"/>`,
  },
  {
    id: 'cps',
    href: '/cps-test',
    title: 'CPS Test',
    hook: 'How many clicks per second can you hit in 10 seconds?',
    category: 'clicking',
    icon: `<path ${S} d="M9 3v3M4.2 4.2l2.1 2.1M3 9h3M13 13l7 3.5-3 1.5-1.5 3L13 13Z"/>`,
  },
  {
    id: 'typing',
    href: '/typing-test',
    title: 'Typing Test',
    hook: 'Measure your words per minute and accuracy on real English words.',
    category: 'typing',
    icon: `<rect ${S} x="2.5" y="6" width="19" height="12" rx="2"/><path ${S} d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>`,
  },
  {
    id: 'aim',
    href: '/aim-trainer',
    title: 'Aim Trainer',
    hook: 'Hit shrinking targets for 30 seconds and track your accuracy.',
    category: 'aim',
    icon: `<circle ${S} cx="12" cy="12" r="8.5"/><circle ${S} cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>`,
  },
  {
    id: 'memory',
    href: '/memory-test',
    title: 'Memory Test',
    hook: 'Memorize the lit tiles, then tap them back from memory.',
    category: 'brain',
    icon: `<rect ${S} x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect ${S} x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect ${S} x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill="currentColor"/>`,
  },
  {
    id: 'sequence',
    href: '/sequence-memory',
    title: 'Sequence Memory',
    hook: 'Repeat the growing pattern, one tile at a time, Simon style.',
    category: 'brain',
    icon: `<path ${S} d="M4 6h6M4 12h10M4 18h14"/><circle cx="19.5" cy="6" r="1.6" fill="currentColor"/>`,
  },
  {
    id: 'f1',
    href: '/f1-reaction-test',
    title: 'F1 Reaction Test',
    hook: 'Five red lights, then lights out. React like a Formula 1 driver.',
    category: 'reaction',
    icon: `<rect ${S} x="4" y="4" width="16" height="7" rx="2"/><circle cx="8" cy="7.5" r="1.3" fill="currentColor"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor"/><circle cx="16" cy="7.5" r="1.3" fill="currentColor"/><path ${S} d="M12 11v9M8 20h8"/>`,
  },
  {
    id: 'spacebar',
    href: '/spacebar-counter',
    title: 'Spacebar Counter',
    hook: 'Hammer the spacebar and count every press per second.',
    category: 'clicking',
    icon: `<rect ${S} x="3" y="9" width="18" height="6.5" rx="2"/><path ${S} d="M7 12.25h10"/>`,
  },
  {
    id: 'tap',
    href: '/tap-speed-test',
    title: 'Tap Speed Test',
    hook: 'Built for thumbs. How many taps per second on your phone?',
    category: 'clicking',
    icon: `<rect ${S} x="7" y="2.5" width="10" height="19" rx="2.5"/><circle ${S} cx="12" cy="12" r="2.6"/>`,
  },
  {
    id: 'rightclick',
    href: '/right-click-test',
    title: 'Right Click Test',
    hook: 'The forgotten button. Test your right-click speed.',
    category: 'clicking',
    icon: `<rect ${S} x="7" y="2.5" width="10" height="19" rx="5"/><path ${S} d="M12 2.5V10"/><path d="M12 3.5h4v6h-4z" fill="currentColor" opacity="0.85"/>`,
  },
  {
    id: 'typing1m',
    href: '/typing-test/1-minute',
    title: '1 Minute Typing Test',
    hook: 'A fast 60 second WPM check when you are short on time.',
    category: 'typing',
    icon: `<circle ${S} cx="12" cy="13" r="8"/><path ${S} d="M12 9v4l2.5 2.5M9.5 2.5h5"/>`,
  },
  {
    id: 'stroop',
    href: '/stroop-test',
    title: 'Stroop Test',
    hook: 'Name the ink color, not the word. Harder than it sounds.',
    category: 'brain',
    icon: `<path ${S} d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.6 0 4.2 3.8 7.6 8.5 7.6.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6h1.9c2.6 0 4.7-2.1 4.7-4.7 0-3.9-4-5.1-9-5.1Z"/><circle cx="7.5" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16.5" cy="10" r="1.2" fill="currentColor"/>`,
  },
  {
    id: '2048',
    href: '/2048',
    title: '2048',
    hook: 'Slide, merge, and chase the 2048 tile in the classic puzzle.',
    category: 'puzzle',
    icon: `<rect ${S} x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path ${S} d="M12 3.5v17M3.5 12h17"/>`,
  },
];

export const byId = (id: string): TestMeta => {
  const t = tests.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown test id: ${id}`);
  return t;
};

/** Homepage "most popular" ordering per spec */
export const popularOrder = ['reaction', 'cps', 'typing', 'aim', 'memory'];
