import type { ArchetypeId } from '../engine/simulation/combat/Archetypes';
import type { Element } from '../engine/simulation/combat/Moves';
import type { WeaponSet } from '../engine/simulation/combat/weapons/Arsenal';

/**
 * The cast: who each fighting style is, where they come from and why they keep
 * showing up in the arena. All of it invented — flavour for the roster tab.
 */
export interface CharacterBio {
  id: ArchetypeId;
  name: string;
  title: string;
  /** One line under the name */
  tagline: string;
  origin: string;
  age: string;
  height: string;
  style: string;
  /** Two short paragraphs */
  lore: [string, string];
  quote: string;
  likes: string[];
  dislikes: string[];
  /** 1 … 10 */
  stats: { power: number; speed: number; technique: number; range: number; flair: number };
  /** Unconfirmed stories; the tab shows one at a time */
  rumours: string[];
  rival: ArchetypeId;
}

export const ELEMENT_COLOR: Record<Element, string> = {
  ki: '#7fd8ff', fire: '#ff7a3d', lightning: '#9fb8ff', dark: '#a070ff', blood: '#ff3d5e', holy: '#ffe9a8',
  glint: '#8fb4ff', wind: '#7dffc8', rot: '#ff6fa9', gold: '#ffc94d', rubber: '#ff9a6b',
};

export const ELEMENT_NAME: Record<Element, string> = {
  ki: 'KI', fire: 'FIRE', lightning: 'LIGHTNING', dark: 'VOID', blood: 'BLOOD', holy: 'RADIANCE',
  glint: 'GLINTSTONE', wind: 'WIND', rot: 'SCARLET', gold: 'GOLD', rubber: 'ELASTIC',
};

export const ROSTER: Record<ArchetypeId, CharacterBio> = {
  saiyan: {
    id: 'saiyan',
    name: 'Kairo Vash',
    title: 'The Unbroken Star',
    tagline: 'Punches first. Asks about the rules when the crater stops smoking.',
    origin: 'Mining moon Tessk-9, a world with eleven times normal gravity',
    age: '27 (claims 26 so that he has one more year to "peak")',
    height: '1.82 m, and the hair adds another 30 cm when he gets serious',
    style: 'Bare-handed ki brawler: fast jab chains, flying knees, beams from the palm',
    lore: [
      'Kairo grew up hauling ore carts on a moon where dropping a spoon could dent the floor. When the mine closed he found out that normal gravity made him feel "like a balloon with fists", so he left to find someone who could hit back.',
      'He has been banned from four tournaments, two planets and one all-you-can-eat buffet. He trains by shadow-boxing meteors on their way down, and says he has lost count of the ones he has "only mostly" stopped.',
    ],
    quote: 'Again. That one actually tickled.',
    likes: ['Seven breakfasts', 'Rivals who get back up', 'Loud music at exactly 131 BPM'],
    dislikes: ['Doors that open inward', 'Opponents who hold back', 'Salad'],
    stats: { power: 9, speed: 8, technique: 6, range: 7, flair: 8 },
    rumours: [
      'He once stopped a blow with his forehead and apologised to the fist.',
      'Stars really do get brighter when he powers up. Astronomers have filed complaints.',
      'He has never lost a staring contest, and one of them lasted three days.',
      'His hair has its own fan club, which it is reportedly not aware of.',
      'He can sense ki from 40 km away, but not whether the stove is still on.',
    ],
    rival: 'rubber',
  },
  shinobi: {
    id: 'shinobi',
    name: 'Rin Kagerou',
    title: 'Last Lantern of the Ashwood Clan',
    tagline: 'You will not see her coming. She finds that a bit sad, honestly.',
    origin: 'Ashwood, a village so hidden that its own mail carrier gave up',
    age: '19',
    height: '1.63 m, unless she is standing on your shadow',
    style: 'Kunai and palm strikes, clones, flash steps, lightning on the counter',
    lore: [
      'Ashwood trained its children to vanish, and Rin was so good at it that the clan forgot to call her home for dinner for eleven years. She took the lantern of the clan head to prove she existed, and has been carrying it into fights ever since.',
      'She fights like a thunderstorm in a hallway: everywhere at once, no warning, and far too polite afterwards. Every clone she makes signs a separate autograph.',
    ],
    quote: 'Behind you. No — the other behind.',
    likes: ['Rooftops at night', 'Paper lanterns', 'Anyone who can find her at hide-and-seek'],
    dislikes: ['Squeaky floorboards', 'Bright hallways', 'Being called "cute"'],
    stats: { power: 6, speed: 10, technique: 9, range: 7, flair: 8 },
    rumours: [
      'At least one of her clones has opened a small bakery.',
      'She has cast a shadow-clone jutsu while asleep. It sleepwalked into a tournament and placed third.',
      'Her kunai always come back, and nobody knows how.',
      'She used to be afraid of the dark until she realised that she is the dark.',
    ],
    rival: 'reaper',
  },
  reaper: {
    id: 'reaper',
    name: 'Soren Kurogane',
    title: 'Captain of the Ninth Gate',
    tagline: 'Collects overdue souls. Very strict about the paperwork.',
    origin: 'The Pale Registry, the bureaucratic side of the afterlife',
    age: '417 (on paper). Looks 24.',
    height: '1.85 m, plus a coat that is much longer than necessary',
    style: 'Iai draws and flash steps, crescent waves of black moonlight, a sealed blade release',
    lore: [
      'Soren was the Registry\'s most punctual clerk until an overdue soul ran off with his pen. He chased it across three worlds and came back a captain, with a katana that has a name it refuses to tell him.',
      'His blade release is officially "for emergencies only". He has filed 1,204 emergency forms this century, each one in triplicate.',
    ],
    quote: 'Your time was up forty seconds ago. I waited. Out of courtesy.',
    likes: ['Silence', 'Moonless nights', 'Neatly stamped forms'],
    dislikes: ['Late returns', 'Sunshine', 'Being asked what the sword is called'],
    stats: { power: 8, speed: 9, technique: 9, range: 7, flair: 9 },
    rumours: [
      'The sword did tell him its name once, and he pretended not to hear it.',
      'He cuts the moon in half every full moon to "keep it humble".',
      'Some people say his coat is lined with the signatures of everyone he has beaten.',
      'He still has not found the pen.',
    ],
    rival: 'shinobi',
  },
  rubber: {
    id: 'rubber',
    name: 'Pip Elastico',
    title: 'The Boundless Grin',
    tagline: 'Punches that arrive a bit after the rest of him. Just as hard, though.',
    origin: 'The Sapfire Harvest Festival, via a very unlucky dive into a vat',
    age: '20',
    height: '1.72 m at rest. Up to 180 m when excited.',
    style: 'Stretching pistol punches, gatling barrages, a sun-bright awakening',
    lore: [
      'At the Sapfire Harvest Festival, Pip bet a whole village that he could hold his breath in the sacred sap vat longer than anyone. He won. He also came out made of something the elders are still arguing about.',
      'Blades bounce off him, bullets bounce off him, and his bills bounce off him too. He wants to find the biggest meal in the world, and he is sure it is waiting on the other side of this fight.',
    ],
    quote: 'Hey! Your punch was great! Mine is going to be bigger!',
    likes: ['Meat on the bone', 'Friends', 'Very big hills to bounce off'],
    dislikes: ['Deep water', 'Vegetables he cannot stretch to reach', 'Bullies'],
    stats: { power: 8, speed: 7, technique: 5, range: 10, flair: 10 },
    rumours: [
      'He once stretched an arm to the next village to grab a snack and forgot to bring it back.',
      'His laugh has been measured on the Richter scale.',
      'Forty-one lightning strikes, zero damage, one very good nap.',
      'He calls every opponent "a new best friend", including during the fight.',
    ],
    rival: 'saiyan',
  },
  tarnished: {
    id: 'tarnished',
    name: 'Sir Aldric Vane',
    title: 'The Twice-Risen (Actually 212 Times)',
    tagline: 'Has died to everything. Has learned from everything.',
    origin: 'The Ashen Marches, a kingdom no map admits is still there',
    age: 'Unknown. He keeps count of his deaths, not of his birthdays.',
    height: '1.94 m in armour that has clearly seen things',
    style: 'Colossal greatsword, rolls through anything, glintstone sorcery on the side',
    lore: [
      'Aldric was exiled, cursed, set on fire and dropped off a cliff, in that order and all in one afternoon. He got back up. He always gets back up. His journal lists every enemy who has ever beaten him, and every one of them has a tick next to its name.',
      'He carries a greatsword heavier than a horse, rolls through doorways out of habit, and bows to every opponent before and after. The bow afterwards is the scary one.',
    ],
    quote: 'Try again? No, friend. I try again.',
    likes: ['Bonfires', 'Well-placed checkpoints', 'Enemies with clear attack patterns'],
    dislikes: ['Poison swamps', 'Ledges', 'Surprises from above'],
    stats: { power: 10, speed: 4, technique: 8, range: 8, flair: 7 },
    rumours: [
      'He has rolled through a dragon\'s breath without breaking stride, humming the whole time.',
      'His helmet has never been seen off, and bets on what is under it run into the thousands.',
      'He once parried a falling meteor. It apologised.',
      'The 213th death has been written in his journal ahead of time. The date keeps getting crossed out.',
    ],
    rival: 'hunter',
  },
  dancer: {
    id: 'dancer',
    name: 'Vesper Lys',
    title: 'The Crimson Waltz',
    tagline: 'To her, a duel and a dance are the same thing, and she has never missed a step.',
    origin: 'The Scarlet Court of Mirelle, a palace that stages ballets on the edge of a volcano',
    age: '23',
    height: '1.70 m, and graceful to the point of being alarming',
    style: 'Twinblade pirouettes, blood-flame arts, a wave of scarlet bloom',
    lore: [
      'Vesper was the Scarlet Court\'s prima ballerina until an assassin interrupted a performance. She finished the routine and the assassin at the same time, and got a standing ovation for both. The court quietly retired her from ballet and gave her a twinblade instead.',
      'She hears music in everything: rain, heartbeats, the clash of steel. When the beat drops, so do her opponents. She hums to set the rhythm and has never lost to anyone who could not keep time.',
    ],
    quote: 'Keep up. The music will not wait for you, and neither will I.',
    likes: ['Waltzes in 3/4', 'Red silk', 'Opponents with good footwork'],
    dislikes: ['Off-beat clapping', 'Mud', 'Being interrupted mid-spin'],
    stats: { power: 7, speed: 9, technique: 10, range: 6, flair: 10 },
    rumours: [
      'She has choreographed every fight she has ever won, before it happened.',
      'Her twinblade was forged from two swords that "didn\'t get along" until she made them dance.',
      'Flower petals follow her. The florists have formed a union.',
      'She once won a duel without her feet touching the ground.',
    ],
    rival: 'sovereign',
  },
  hunter: {
    id: 'hunter',
    name: 'Hana Wyvernsbane',
    title: 'Slayer of the Cathedral-Sized',
    tagline: 'Her usual prey is the size of a mountain. You are a nice change of pace.',
    origin: 'Emberfall Outpost, the last campfire before the monster frontier',
    age: '29',
    height: '1.76 m, with a sword a bit taller than that',
    style: 'Spirit-charged longsword, counter-iai, fire and thunder discharge',
    lore: [
      'Hana hunts beasts the size of cathedrals for a living and cooks their steaks on a portable grill in the middle of the fight. She has a scar for each of the 97 species in the Hunters\' Almanac, and has written three new chapters herself.',
      'She reads a fight the way she reads a wyvern: wait for the tell, step in, and cut once, perfectly. Fighting people is "relaxing", she says, because they rarely breathe fire. Rarely.',
    ],
    quote: 'Hold still. I am only going to do this once.',
    likes: ['Well-done steaks', 'Sharpening stones', 'Monsters with big weak points'],
    dislikes: ['Flash bugs', 'Being carted', 'Anything that flies away at low health'],
    stats: { power: 9, speed: 6, technique: 9, range: 8, flair: 7 },
    rumours: [
      'She has fallen asleep during a wyvern charge and woken up in time to counter it.',
      'The grill has been through more fights than most knights.',
      'Her "one cut" rule has only been broken once, and the mountain it was aimed at is now two hills.',
      'She names every monster she fights, and sends the survivors birthday cards.',
    ],
    rival: 'tarnished',
  },
  sovereign: {
    id: 'sovereign',
    name: 'Aurelius Thorne',
    title: 'King of Ten Thousand Blades',
    tagline: 'Owns a treasury in another dimension, and throws it at you.',
    origin: 'The Gilded Vault of Aurum, a kingdom that runs on legendary weaponry',
    age: '31, and that is how old he intends to stay',
    height: '1.88 m, and he walks as if the ground were honoured to be under him',
    style: 'Spear forms, golden gates that fire weapons, chains of heaven, rains of swords',
    lore: [
      'Aurelius inherited a vault holding one of every weapon ever made, plus several that have not been made yet. He treats them like confetti. Historians weep every time he throws a priceless relic at someone\'s head and then forgets to pick it up.',
      'He fights with a single spear until someone earns the rest. Then the sky opens with golden gates and the arena learns what "ten thousand blades" means, all at once.',
    ],
    quote: 'Kneel, or be pinned. I have plenty of both.',
    likes: ['Gold leaf', 'Worthy challengers', 'Dramatic entrances'],
    dislikes: ['Mongrels', 'Paying for things', 'People touching his weapons'],
    stats: { power: 9, speed: 7, technique: 8, range: 10, flair: 10 },
    rumours: [
      'He has never once pointed a weapon twice at the same person. "It would be rude."',
      'The vault\'s inventory clerk quit after four hundred years, and nobody has taken the job since.',
      'Half the weapons in his gate have never been drawn by anyone. The other half would like a word.',
      'He dropped a relic sword in a lake once. A kingdom grew around it.',
    ],
    rival: 'dancer',
  },
};

// ---------------------------------------------------------------- weapon provenance
// A small grammar of forges, makers and quirks, picked by the weapon's id and the
// show's seed: the same pair always tells the same (entirely made-up) story.

const FORGED = [
  'forged in the heart of a dying star', 'quenched in the tears of a mountain giant', 'hammered out on the back of a sleeping dragon',
  'grown, not forged, in the Glass Orchards of Vey', 'pulled from the lightning of a nine-day storm', 'folded 10,000 times by a monk who hated shortcuts',
  'won in a card game against the god of tin', 'cast from the melted crown of a forgotten king', 'fished out of the Sea of Echoes',
  'carved from the moon\'s own shadow', 'assembled from the pieces of 108 broken rivals',
];
const MAKERS = [
  'by Old Mother Anvil', 'by the twin smiths Harn and Harrow', 'by a retired god of war with too much free time',
  'by a blacksmith who was also, confusingly, a cat', 'by the Guild of Very Sharp Things', 'by nobody (it simply appeared one Tuesday)',
  'by a hermit who only spoke to his hammer', 'by the 3rd Imperial Armoury, now a bakery',
];
const QUIRKS = [
  'It hums the note B-flat before a critical hit.', 'It is considered bad luck to call it by its real name, which is Gerald.',
  'It has refused to be sheathed on at least four occasions.', 'Every owner so far has become famous, or become a crater.',
  'It glows faintly whenever someone nearby is lying.', 'It gets heavier when its wielder is sad.',
  'Three museums claim to own the original. All three are wrong.', 'It once won a duel on its own while its owner slept.',
  'It purrs on the downbeat.', 'It is afraid of butterflies, and nobody knows why.', 'It has a small fan club, all of them its previous owners\' rivals.',
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A made-up history for a weapon set: stable for a given seed */
export function weaponLore(set: WeaponSet, seed: number): string {
  const h = hash(`${set.id}:${seed}`);
  const f = FORGED[h % FORGED.length]!;
  const m = MAKERS[(h >>> 8) % MAKERS.length]!;
  const q = QUIRKS[(h >>> 16) % QUIRKS.length]!;
  return `${f[0]!.toUpperCase()}${f.slice(1)} ${m}. ${q}`;
}

/** One rumour, chosen by the seed (and a nudge to roll another) */
export function rumour(bio: CharacterBio, seed: number, roll = 0): string {
  return bio.rumours[(hash(`${bio.id}:${seed}`) + roll) % bio.rumours.length]!;
}
