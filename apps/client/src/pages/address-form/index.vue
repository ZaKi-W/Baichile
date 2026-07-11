<script setup lang="ts">
import { ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { PlaceSuggestion } from '@baichile/api-contract';
import { nearbyPlaces, reverseGeocode, suggestPlaces } from '../../services/location';
import { exchangeWechatPhoneCode, wechatPhoneFailureMessage } from '../../services/wechat-phone';
import { useAddressStore } from '../../stores/address';
import { locationSelection, placeSelection } from './location-state';

const addressStore = useAddressStore();

const name = ref('');
const phone = ref('');
const addressText = ref('');
const detail = ref('');
const tag = ref('家');
const isDefault = ref(false);
const tags = ['家', '公司', '学校', '其他'];
const saving = ref(false);
const fetchingPhone = ref(false);

/* ── GPS & nearby ── */
const currentLat = ref(0);
const currentLng = ref(0);
const locating = ref(false);
const nearbyList = ref<PlaceSuggestion[]>([]);
const nearbyLoading = ref(false);

/* ── search ── */
const searchResults = ref<PlaceSuggestion[]>([]);
const searching = ref(false);
const showResults = ref(false);
const searchError = ref('');
const currentCity = ref('');
let timer: ReturnType<typeof setTimeout>;
let internalAddressValue: string | null = null;

let selectedLat = 31.2304;
let selectedLng = 121.4737;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function setSelectedAddress(value: string) {
  internalAddressValue = value;
  addressText.value = value;
}

/* ── 获取当前定位 ── */
async function locateMe() {
  if (locating.value) return;
  locating.value = true;
  try {
    const res = await new Promise<UniApp.GetLocationSuccess>((resolve, reject) => {
      uni.getLocation({ type: 'gcj02', isHighAccuracy: true, success: resolve, fail: reject });
    });
    currentLat.value = res.latitude;
    currentLng.value = res.longitude;
    selectedLat = res.latitude;
    selectedLng = res.longitude;

    try {
      const area = await reverseGeocode(res.latitude, res.longitude);
      const selection = locationSelection(res, area);
      currentCity.value = area.city;
      setSelectedAddress(selection.address);
      uni.showToast({ title: '已获取当前位置', icon: 'success' });
    } catch (error) {
      uni.showToast({ title: errorMessage(error, '已定位，但地址解析失败'), icon: 'none' });
    }

    await loadNearby(res.latitude, res.longitude);
  } catch (err: any) {
    if (err?.errMsg?.includes('auth') || err?.errMsg?.includes('deny')) {
      uni.showModal({
        title: '需要定位权限',
        content: '请在设置中开启位置权限后重试',
        confirmText: '去设置',
        success: (res) => { if (res.confirm) uni.openSetting(); },
      });
    } else {
      uni.showToast({ title: '定位失败，请重试', icon: 'none' });
    }
  } finally {
    locating.value = false;
  }
}

/* ── 加载附近地点 ── */
async function loadNearby(lat: number, lng: number) {
  nearbyLoading.value = true;
  try {
    nearbyList.value = await nearbyPlaces(lat, lng);
  } catch (error) {
    nearbyList.value = [];
    uni.showToast({ title: errorMessage(error, '附近地点加载失败'), icon: 'none' });
  } finally {
    nearbyLoading.value = false;
  }
}

/* ── 地图选点 (uni.chooseLocation) ── */
async function pickOnMap() {
  try {
    const res = await new Promise<UniApp.ChooseLocationSuccess>((resolve, reject) => {
      uni.chooseLocation({
        latitude: currentLat.value || undefined,
        longitude: currentLng.value || undefined,
        success: resolve,
        fail: reject,
      });
    });
    selectedLat = res.latitude;
    selectedLng = res.longitude;
    setSelectedAddress(res.name || res.address || '');
    showResults.value = false;
    searchResults.value = [];
    // Update nearby list centered on picked location
    currentLat.value = res.latitude;
    currentLng.value = res.longitude;
    await loadNearby(res.latitude, res.longitude);
  } catch (err: any) {
    // User cancelled — do nothing
    if (err?.errMsg?.includes('cancel')) return;
    uni.showToast({ title: '地图选点失败', icon: 'none' });
  }
}

/* ── keyword search ── */
watch(addressText, (val) => {
  clearTimeout(timer);
  searchError.value = '';
  if (internalAddressValue !== null) {
    const isInternalUpdate = val === internalAddressValue;
    internalAddressValue = null;
    if (isInternalUpdate) return;
  }
  if (!val.trim() || val.length < 2) {
    searchResults.value = [];
    showResults.value = false;
    return;
  }
  searching.value = true;
  showResults.value = true;
  timer = setTimeout(async () => {
    try {
      searchResults.value = await suggestPlaces(val.trim(), currentCity.value || undefined);
    } catch (error) {
      searchResults.value = [];
      searchError.value = errorMessage(error, '地点搜索失败，请稍后重试');
    } finally {
      searching.value = false;
    }
  }, 400);
});

/* ── pick a place from list ── */
function pickPlace(place: PlaceSuggestion) {
  const selection = placeSelection(place);
  setSelectedAddress(selection.address);
  selectedLat = selection.lat;
  selectedLng = selection.lng;
  nearbyList.value = selection.nearbyList;
  showResults.value = false;
  searchResults.value = [];
}

function useTypedAddress() {
  const value = addressText.value.trim();
  if (!value) return;
  if (currentLat.value && currentLng.value) {
    selectedLat = currentLat.value;
    selectedLng = currentLng.value;
  }
  setSelectedAddress(value);
  showResults.value = false;
  searchResults.value = [];
}

async function useWechatPhone(event: { detail?: { code?: string; errMsg?: string } }) {
  const code = event.detail?.code;
  if (!code) {
    uni.showToast({
      title: wechatPhoneFailureMessage(event.detail?.errMsg),
      icon: 'none',
    });
    return;
  }
  fetchingPhone.value = true;
  try {
    phone.value = await exchangeWechatPhoneCode(code);
    uni.showToast({ title: '手机号已填写', icon: 'success' });
  } catch (error) {
    uni.showToast({ title: errorMessage(error, '获取手机号失败，请手动填写'), icon: 'none' });
  } finally {
    fetchingPhone.value = false;
  }
}

function wechatPhoneTapped() {
  uni.showToast({ title: '正在请求微信授权', icon: 'loading', duration: 800 });
}

function setDefaultAddress(event: Event) {
  isDefault.value = Boolean((event as Event & { detail?: { value?: boolean } }).detail?.value);
}

/* ── validate & save ── */
function validate(): string | null {
  if (!name.value.trim()) return '请输入联系人';
  if (!phone.value.trim() || phone.value.trim().length < 6) return '请输入手机号';
  if (!addressText.value.trim()) return '请选择收货地址';
  return null;
}

async function save() {
  const error = validate();
  if (error) {
    uni.showToast({ title: error, icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const id = `addr_${Date.now()}`;
    await addressStore.save({
      id,
      name: name.value.trim(),
      phone: phone.value.trim(),
      address: addressText.value.trim(),
      detail: detail.value.trim(),
      tag: tag.value,
      lat: selectedLat,
      lng: selectedLng,
      isDefault: isDefault.value,
    });
    uni.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } finally {
    saving.value = false;
  }
}

/* ── lifecycle: auto-locate on page load ── */
onLoad(() => {
  locateMe();
});
</script>

<template>
  <view class="page">
    <!-- ── 选地址区域 ── -->
    <view class="form-section location-section">
      <view class="location-actions">
        <view class="action-btn gps" :class="{ loading: locating }" @tap="locateMe">
          <image class="action-icon" src="/static/icons/location.svg" mode="aspectFit" />
          <text class="action-text">{{ locating ? '定位中...' : '获取当前位置' }}</text>
        </view>
        <view class="action-btn map" @tap="pickOnMap">
          <image class="action-icon" src="/static/marker-store.png" mode="aspectFit" />
          <text class="action-text">地图选点</text>
        </view>
      </view>

      <!-- 搜索框 -->
      <view class="search-bar">
        <input
          class="search-input"
          v-model="addressText"
          placeholder="搜索小区、写字楼、学校..."
        />
        <view v-if="addressText" class="clear-btn" @tap="addressText = ''; showResults = false">
          <text class="clear-x">✕</text>
        </view>
      </view>

      <!-- 搜索结果下拉 -->
      <view v-if="showResults" class="dropdown">
        <view v-if="searching" class="dropdown-hint">搜索中...</view>
        <view v-else-if="searchError" class="dropdown-hint">{{ searchError }}</view>
        <view v-else-if="!searchResults.length" class="place-item manual-place" @tap="useTypedAddress">
          <text class="place-title">使用「{{ addressText.trim() }}」作为地址</text>
          <text class="place-addr">村里地址搜不到也可以直接保存，路线会使用当前定位或默认虚拟坐标</text>
        </view>
        <view v-for="place in searchResults" :key="place.id" class="place-item" @tap="pickPlace(place)">
          <text class="place-title">{{ place.title }}</text>
          <text class="place-addr">{{ place.address }}</text>
        </view>
      </view>
    </view>

    <!-- ── 附近地点 ── -->
    <view v-if="nearbyLoading" class="nearby-section">
      <text class="section-title">附近地点</text>
      <view class="nearby-loading">加载中...</view>
    </view>
    <view v-else-if="nearbyList.length" class="nearby-section">
      <text class="section-title">附近地点</text>
      <view v-for="place in nearbyList" :key="place.id" class="place-item" @tap="pickPlace(place)">
        <text class="place-title">{{ place.title }}</text>
        <text class="place-addr">{{ place.address }}</text>
      </view>
    </view>

    <!-- ── 详细地址 & 联系人 ── -->
    <view class="form-section">
      <view class="field">
        <text class="label">联系人</text>
        <input class="input" v-model="name" placeholder="姓名" />
      </view>
      <view class="field">
        <text class="label">手机号</text>
        <view class="phone-control">
          <input class="input phone-input" v-model="phone" type="number" placeholder="手机号码" maxlength="11" />
          <!-- #ifdef MP-WEIXIN -->
          <button
            class="wechat-phone-btn"
            open-type="getPhoneNumber"
            :loading="fetchingPhone"
            :disabled="fetchingPhone"
            @tap="wechatPhoneTapped"
            @getphonenumber="useWechatPhone"
          >微信手机号</button>
          <!-- #endif -->
        </view>
      </view>
      <view class="field">
        <text class="label">门牌号</text>
        <input class="input" v-model="detail" placeholder="例: 5号楼 302室" />
      </view>
    </view>

    <!-- ── 标签 & 默认 ── -->
    <view class="form-section">
      <view class="field tag-field">
        <text class="label">标签</text>
        <view class="tag-group">
          <text
            v-for="t in tags"
            :key="t"
            class="tag-btn"
            :class="{ active: tag === t }"
            @tap="tag = t"
          >{{ t }}</text>
        </view>
      </view>
      <view class="field switch-field">
        <text class="label">设为默认地址</text>
        <switch :checked="isDefault" @change="setDefaultAddress" color="#ffd400" />
      </view>
    </view>

    <!-- ── 保存按钮 ── -->
    <view class="bottom-bar">
      <button class="save-btn" :loading="saving" @tap="save">保存地址</button>
    </view>
  </view>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24rpx 28rpx calc(160rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: #f6f6f6;
}

/* ── 选地址区域 ── */
.location-section {
  padding: 24rpx;
}
.location-actions {
  display: flex;
  gap: 16rpx;
  margin-bottom: 20rpx;
}
.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  padding: 20rpx 0;
  border: 1rpx solid #ececec;
  border-radius: 18rpx;
  font-size: 26rpx;
  font-weight: 600;
}
.action-btn.gps {
  color: #171717;
  background: #fff7cf;
}
.action-btn.gps.loading {
  opacity: 0.6;
}
.action-btn.map {
  color: #171717;
  background: #fff;
}
.action-icon {
  width: 32rpx;
  height: 32rpx;
}
.action-text {
  font-size: 26rpx;
}

/* ── 搜索栏 ── */
.search-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 20rpx;
  border: 2rpx solid #171717;
  border-radius: 24rpx;
  background: #fff;
}
.search-input {
  flex: 1;
  font-size: 28rpx;
  color: #171717;
}
.clear-btn {
  width: 36rpx;
  height: 36rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ccc;
}
.clear-x {
  font-size: 18rpx;
  color: #fff;
}

/* ── 搜索结果下拉 ── */
.dropdown {
  margin-top: 12rpx;
  border-top: 1rpx solid #f0f0ee;
  padding-top: 8rpx;
}
.dropdown-hint {
  padding: 20rpx 0;
  color: #999;
  font-size: 24rpx;
  text-align: center;
}

/* ── 附近地点 ── */
.nearby-section {
  margin-bottom: 24rpx;
  padding: 20rpx 24rpx;
  border-radius: 24rpx;
  background: #fff;
}
.section-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #999;
  margin-bottom: 12rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #f0f0ee;
}
.nearby-loading {
  padding: 24rpx 0;
  color: #999;
  font-size: 24rpx;
  text-align: center;
}

/* ── 地点列表项 ── */
.place-item {
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f8f8f6;
}
.place-item:last-child { border-bottom: 0; }
.place-title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #171717;
}
.place-addr {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #999;
}

/* ── 表单区域 ── */
.form-section {
  margin-bottom: 24rpx;
  padding: 8rpx 24rpx;
  border: 1rpx solid #ececec;
  border-radius: 24rpx;
  background: #fff;
}
.field {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #f0f0ee;
}
.field:last-child { border-bottom: 0; }
.label {
  width: 140rpx;
  flex: 0 0 auto;
  font-size: 28rpx;
  font-weight: 700;
  color: #333;
}
.input {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  color: #171717;
}
.phone-control {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 12rpx;
}
.phone-input {
  width: 0;
}
.wechat-phone-btn {
  flex: 0 0 auto;
  height: 56rpx;
  margin: 0;
  padding: 0 20rpx;
  border-radius: 28rpx;
  color: #171717;
  background: #ffd400;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 56rpx;
}
.wechat-phone-btn::after { border: 0; }

/* ── 标签 ── */
.tag-field { flex-wrap: wrap; }
.tag-group { display: flex; gap: 16rpx; flex: 1; }
.tag-btn {
  padding: 10rpx 28rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #888;
  background: #f6f6f6;
}
.tag-btn.active {
  color: #171717;
  background: #ffd400;
  font-weight: 800;
}

/* ── 开关 ── */
.switch-field { justify-content: space-between; }

/* ── 底部保存 ── */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, .06);
}
.save-btn {
  width: 100%;
  height: 88rpx;
  margin: 0;
  border-radius: 22rpx;
  color: #171717;
  background: #ffd400;
  font-size: 30rpx;
  font-weight: 800;
  line-height: 88rpx;
}
.save-btn::after { border: 0; }
</style>
