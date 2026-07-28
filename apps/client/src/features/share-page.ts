import { ref } from 'vue';
import type { ShareLanding } from '@baichile/api-contract';
import { shareService } from '../services/shares';
import { trackEvent } from '../services/analytics';
import { useAuthStore } from '../stores/auth';

type PageOptions = Record<string, string | undefined>;

export function useSharePage() {
  const auth = useAuthStore();
  const data = ref<ShareLanding>();
  const loading = ref(true);
  const token = ref('');
  const sharing = ref(false);
  const rewardCents = ref(0);
  let rewardRequested = false;

  async function load(options?: PageOptions) {
    const input = options ?? {};
    token.value = decodeURIComponent(String(input.token || input.t || input.scene || ''));
    sharing.value = input.share === '1';
    rewardCents.value = Number(input.reward || 0) || 0;
    try {
      const landing = await shareService.landing(token.value);
      data.value = landing;
      void trackEvent('share.landing_viewed', {
        kind: landing.kind ?? 'unknown',
        active: landing.active,
        ownerView: sharing.value,
      }, auth.accessToken);
      if (landing.kind === 'reward' && token.value) auth.rememberReferral(token.value);
    } catch {
      data.value = {
        active: false,
        dishNames: [],
        savedMoneyCents: 0,
        savedCaloriesKcal: 0,
        completedOrderCount: 0,
        inviteeRewardCents: 0,
        benefitText: '',
      };
    } finally {
      loading.value = false;
    }
    if (sharing.value) uni.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  }

  function shareQuery() {
    return `token=${encodeURIComponent(token.value)}`;
  }

  function rewardShare() {
    if (data.value?.kind !== 'reward' || !sharing.value || !token.value || rewardRequested) return;
    rewardRequested = true;
    void shareService.reward(token.value).then((result) => {
      void trackEvent('share.reward_result', {
        granted: result.granted,
        amountCents: result.amountCents,
      }, auth.accessToken);
      if (!result.granted) return;
      uni.showToast({ title: `分享奖励 +¥${(result.amountCents / 100).toFixed(0)}`, icon: 'success' });
    }).catch(() => {
      void trackEvent('share.reward_result', {
        granted: false,
        amountCents: 0,
      }, auth.accessToken);
      rewardRequested = false;
    });
  }

  function enterApp() {
    void trackEvent('auth.login_gate_shown', { source: 'share_landing' }, auth.accessToken);
    auth.requestLogin();
    uni.switchTab({ url: '/pages/profile/index' });
  }

  return { data, loading, token, sharing, rewardCents, load, shareQuery, rewardShare, enterApp };
}
