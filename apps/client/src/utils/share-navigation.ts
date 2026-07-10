import type { ShareCard } from '@baichile/api-contract';

export function shareLandingUrl(card: ShareCard): string {
  const separator = card.path.includes('?') ? '&' : '?';
  return `${card.path}${separator}share=1&reward=${card.initiatedRewardCents}`;
}
