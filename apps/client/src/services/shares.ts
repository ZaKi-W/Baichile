import type { ShareCard, ShareCreateRequest, ShareLanding } from '@baichile/api-contract';
import { useAuthStore } from '../stores/auth';
import { requestApi } from './http';

export const shareService = {
  create(input: ShareCreateRequest) {
    const auth = useAuthStore();
    return requestApi<ShareCard>('POST', '/v1/shares', auth.accessToken, input);
  },
  landing(token: string) {
    return requestApi<ShareLanding>('GET', `/v1/shares/${encodeURIComponent(token)}`, '');
  },
};
