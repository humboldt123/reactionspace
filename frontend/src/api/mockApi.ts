import type { MediaItem } from '../types';

// Mock data with spatial positioning
const mockItems: MediaItem[] = [
  {
    id: '1',
    name: 'But It Refused',
    description: 'Determination meme',
    caption: 'undertale heart determination text red gaming',
    filePath: '/reactions/but_it_refused.webp',
    thumbnailPath: '/reactions/but_it_refused.webp',
    fileType: 'image',
    x: -200,
    y: -150,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-01'),
  },
  {
    id: '2',
    name: 'Goomba',
    description: 'Mario goomba reaction',
    caption: 'mario goomba mushroom enemy brown gaming nintendo',
    filePath: '/reactions/gomba.webp',
    thumbnailPath: '/reactions/gomba.webp',
    fileType: 'image',
    x: 100,
    y: -100,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-02'),
  },
  {
    id: '3',
    name: 'True True True',
    description: 'Streamer saying true repeatedly',
    caption: 'streamer true true true reaction twitch agreement nodding',
    filePath: '/reactions/PYA0vOVc_gZdxDHI.mp4',
    thumbnailPath: '/reactions/PYA0vOVc_gZdxDHI.mp4',
    fileType: 'video',
    x: 200,
    y: 250,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-03'),
  },
  {
    id: '4',
    name: 'Oppenheimer Quantum Gravity',
    description: 'Oppenheimer talking about quantum gravity paradox',
    caption: 'oppenheimer physics quantum gravity paradox science movie clip',
    filePath: '/reactions/RgFi1HcVktgTIxC8.mp4',
    thumbnailPath: '/reactions/RgFi1HcVktgTIxC8.mp4',
    fileType: 'video',
    x: -100,
    y: 50,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-04'),
  },
  {
    id: '5',
    name: 'Absolute Cinema',
    description: 'Absolute cinema reaction meme',
    caption: 'absolute cinema kino perfection movie reaction',
    filePath: '/reactions/absolute cinema.webp',
    thumbnailPath: '/reactions/absolute cinema.webp',
    fileType: 'image',
    x: 350,
    y: -200,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-05'),
  },
  {
    id: '6',
    name: 'Buddha Flowers',
    description: 'Buddha attacks turn to flowers',
    caption: 'buddha peace flowers spiritual zen calm meditation',
    filePath: '/reactions/buddha attacks turn to flowers.webp',
    thumbnailPath: '/reactions/buddha attacks turn to flowers.webp',
    fileType: 'image',
    x: -450,
    y: -50,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-06'),
  },
  {
    id: '7',
    name: 'Fact Soyjak',
    description: 'Soyjak wojak pointing fact',
    caption: 'soyjak wojak pointing fact true correct meme',
    filePath: '/reactions/fact soyjak wojak.webp',
    thumbnailPath: '/reactions/fact soyjak wojak.webp',
    fileType: 'image',
    x: 50,
    y: 400,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-07'),
  },
  {
    id: '8',
    name: 'King Charles',
    description: 'King Charles video',
    caption: 'king charles royalty british monarchy video',
    filePath: '/reactions/king_charles_remux.mp4',
    thumbnailPath: '/reactions/king_charles_remux.mp4',
    fileType: 'video',
    x: -250,
    y: 350,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-08'),
  },
  {
    id: '9',
    name: 'LeBron Edit',
    description: 'LeBron James edit',
    caption: 'lebron james basketball nba edit hype sports',
    filePath: '/reactions/lebron_edit.mp4',
    thumbnailPath: '/reactions/lebron_edit.mp4',
    fileType: 'video',
    x: 400,
    y: 100,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-09'),
  },
  {
    id: '10',
    name: 'Miyazaki AI Crashout',
    description: 'Miyazaki reacting negatively to AI',
    caption: 'miyazaki hayao anime ai disgust anger studio ghibli',
    filePath: '/reactions/miyazaki crashout because of ai.webp',
    thumbnailPath: '/reactions/miyazaki crashout because of ai.webp',
    fileType: 'image',
    x: -350,
    y: -350,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-10'),
  },
  {
    id: '11',
    name: 'Oppenheimer Stare',
    description: 'Oppenheimer staring through goggles',
    caption: 'oppenheimer trinity goggles stare intense movie atomic',
    filePath: '/reactions/oppenheimer staring trinity goggles glasses stare.webp',
    thumbnailPath: '/reactions/oppenheimer staring trinity goggles glasses stare.webp',
    fileType: 'image',
    x: 150,
    y: -350,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-11'),
  },
  {
    id: '12',
    name: 'Snail Wojak Salt',
    description: 'Snail wojak with salt',
    caption: 'snail wojak salt crying sad meme despair',
    filePath: '/reactions/snail wojak salt.webp',
    thumbnailPath: '/reactions/snail wojak salt.webp',
    fileType: 'image',
    x: -100,
    y: -400,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-12'),
  },
  {
    id: '13',
    name: 'Smug Wojak',
    description: 'Smug wojak',
    caption: 'wojak smug superior confident meme',
    filePath: '/reactions/wojak smug.webp',
    thumbnailPath: '/reactions/wojak smug.webp',
    fileType: 'image',
    x: 300,
    y: 350,
    width: 200,
    height: 150,
    positionLocked: false,
    createdAt: new Date('2024-01-13'),
  },
];

export const mockApi = {
  async getItems(): Promise<MediaItem[]> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [...mockItems];
  },

  async updateItemPosition(
    id: string,
    x: number,
    y: number
  ): Promise<MediaItem> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const item = mockItems.find((i) => i.id === id);
    if (!item) throw new Error('Item not found');
    item.x = x;
    item.y = y;
    item.positionLocked = true;
    return { ...item };
  },

  async searchItems(query: string): Promise<MediaItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const lowerQuery = query.toLowerCase();

    // Find direct matches
    const directMatches = mockItems.filter(
      (item) =>
        item.name?.toLowerCase().includes(lowerQuery) ||
        item.description?.toLowerCase().includes(lowerQuery) ||
        item.caption?.toLowerCase().includes(lowerQuery)
    );

    // Find spatially nearby items (within 300px radius of direct matches)
    const PROXIMITY_RADIUS = 300;
    const nearbyItems = new Set<MediaItem>();

    directMatches.forEach(match => {
      mockItems.forEach(item => {
        if (item.id === match.id) return; // Skip the match itself

        const distance = Math.sqrt(
          Math.pow(item.x - match.x, 2) + Math.pow(item.y - match.y, 2)
        );

        if (distance <= PROXIMITY_RADIUS) {
          nearbyItems.add(item);
        }
      });
    });

    // Combine results: direct matches first, then nearby items
    const allResults = [
      ...directMatches,
      ...Array.from(nearbyItems)
    ];

    // Remove duplicates and return
    return Array.from(new Map(allResults.map(item => [item.id, item])).values());
  },

  async updateItem(id: string, updates: Partial<MediaItem>): Promise<MediaItem> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const item = mockItems.find((i) => i.id === id);
    if (!item) throw new Error('Item not found');
    Object.assign(item, updates);
    return { ...item };
  },
};
