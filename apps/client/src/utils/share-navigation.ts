import type { ShareCard } from '@baichile/api-contract';

export function shareLandingUrl(card: ShareCard): string {
  const separator = card.path.includes('?') ? '&' : '?';
  const reward = (card.kind === 'reward' || card.kind === 'invitation') ? `&reward=${card.initiatedRewardCents}` : '';
  return `${card.path}${separator}share=1${reward}`;
}

export function legacyShareTarget(kind: ShareCard['kind'] | undefined, _hasEasterEgg = false): string | undefined {
  if (kind === 'order') return '/pages/share-order/index';
  if (kind === 'order_egg') return '/pages/share-egg/index';
  if (kind === 'achievement') return '/pages/share-achievement/index';
  if (kind === 'reward' || kind === 'invitation') return '/pages/share-reward/index';
  return undefined;
}
