<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { PlaceSuggestion } from '@baichile/api-contract';
import AppIcon from '../../components/AppIcon.vue';
import { AREA_DATA } from '../../data/area-data';
import { suggestPlaces } from '../../services/location';
import { useLocationStore } from '../../stores/location';

const location = useLocationStore();
const statusBarHeight = uni.getSystemInfoSync().statusBarHeight ?? 20;
const safeTopStyle = { paddingTop: `${statusBarHeight + 14}px` };

/* ── search ── */
const keyword = ref('');
const results = ref<PlaceSuggestion[]>([]);
const searching = ref(false);
const searched = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

watch(keyword, (value) => {
  clearTimeout(timer);
  if (!value.trim()) {
    results.value = [];
    searched.value = false;
    searching.value = false;
    return;
  }
  searching.value = true;
  timer = setTimeout(async () => {
    try {
      results.value = await suggestPlaces(value.trim(), selectedProvince.value || undefined);
    } catch {
      results.value = [];
    } finally {
      searching.value = false;
      searched.value = true;
    }
  }, 400);
});

/* ── hierarchical selection ── */
type Tab = 'province' | 'city' | 'district';
const activeTab = ref<Tab>('province');
const selectedProvince = ref('');
const selectedCity = ref('');
const selectedDistrict = ref('');
const resolving = ref(false);

const provinceNames = computed(() => AREA_DATA.map((p) => p.n));

const cityNames = computed(() => {
  if (!selectedProvince.value) return [];
  const p = AREA_DATA.find((x) => x.n === selectedProvince.value);
  return p ? p.c.map((c) => c.n) : [];
});

const districtNames = computed(() => {
  if (!selectedProvince.value || !selectedCity.value) return [];
  const p = AREA_DATA.find((x) => x.n === selectedProvince.value);
  const c = p?.c.find((x) => x.n === selectedCity.value);
  return c ? c.d : [];
});

const currentList = computed(() => {
  if (activeTab.value === 'province') return provinceNames.value;
  if (activeTab.value === 'city') return cityNames.value;
  return districtNames.value;
});

const currentSelected = computed(() => {
  if (activeTab.value === 'province') return selectedProvince.value;
  if (activeTab.value === 'city') return selectedCity.value;
  return selectedDistrict.value;
});

function switchTab(tab: Tab) {
  activeTab.value = tab;
}

function selectItem(name: string) {
  if (activeTab.value === 'province') {
    if (selectedProvince.value !== name) {
      selectedCity.value = '';
      selectedDistrict.value = '';
    }
    selectedProvince.value = name;
    activeTab.value = 'city';
  } else if (activeTab.value === 'city') {
    if (selectedCity.value !== name) {
      selectedDistrict.value = '';
    }
    selectedCity.value = name;
    activeTab.value = 'district';
  } else {
    selectedDistrict.value = name;
    resolveRegion();
  }
}

async function resolveRegion() {
  const district = selectedDistrict.value;
  const city = selectedCity.value;
  const province = selectedProvince.value;
  resolving.value = true;
  try {
    let places = await suggestPlaces(district);
    if (!places.length) places = await suggestPlaces(city);
    if (!places.length) places = await suggestPlaces(province);
    if (!places.length) {
      resolving.value = false;
      uni.showToast({ title: '无法获取该地区坐标', icon: 'none' });
      return;
    }
    await location.selectPlace(places[0]);
    uni.showToast({ title: '已选择', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch {
    resolving.value = false;
    uni.showToast({ title: '选择失败，请重试', icon: 'none' });
  }
}

/* ── GPS ── */
async function useCurrentLocation() {
  await location.locate();
  if (location.status === 'ready') {
    uni.showToast({ title: '定位成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  }
}

/* ── search result ── */
async function selectPlace(place: PlaceSuggestion) {
  await location.selectPlace(place);
  uni.showToast({ title: '已选择', icon: 'success' });
  setTimeout(() => uni.navigateBack(), 600);
}

/* ── init: pre-select current area if available ── */
if (location.area) {
  const p = location.area.province;
  const c = location.area.city;
  const d = location.area.district;
  if (p && AREA_DATA.some((x) => x.n === p)) {
    selectedProvince.value = p;
    if (c) selectedCity.value = c;
    if (d) selectedDistrict.value = d;
  }
}
</script>

<template>
  <view class="picker-page">
    <!-- header -->
    <header class="picker-header" :style="safeTopStyle">
      <view class="search-bar">
        <AppIcon name="search" :size="16" />
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索地点"
          confirm-type="search"
        />
        <text v-if="keyword" class="clear-btn" @tap="keyword = ''">✕</text>
      </view>
    </header>

    <!-- GPS action -->
    <view class="action-row">
      <button class="locate-action" @tap="useCurrentLocation">
        <AppIcon name="location" :size="16" />
        <text class="action-label">使用当前位置</text>
        <text v-if="location.area" class="action-detail">{{ location.area.district }}</text>
      </button>
    </view>

    <!-- search results mode -->
    <view v-if="keyword.trim()" class="picker-body">
      <view v-if="searching" class="state-text">搜索中…</view>
      <view v-else-if="searched && !results.length" class="state-text">没有找到相关地点</view>
      <view v-else class="result-list">
        <button
          v-for="item in results"
          :key="item.id"
          class="result-item"
          @tap="selectPlace(item)"
        >
          <view class="result-title">{{ item.title }}</view>
          <view class="result-address">{{ item.address }}</view>
        </button>
      </view>
    </view>

    <!-- browse mode -->
    <view v-else class="browse-area">
      <!-- tab bar -->
      <view class="tab-bar">
        <button
          class="tab-item"
          :class="{ active: activeTab === 'province' }"
          @tap="switchTab('province')"
        >{{ selectedProvince || '省份' }}</button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'city', disabled: !selectedProvince }"
          @tap="selectedProvince && switchTab('city')"
        >{{ selectedCity || '城市' }}</button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'district', disabled: !selectedCity }"
          @tap="selectedCity && switchTab('district')"
        >{{ selectedDistrict || '区县' }}</button>
      </view>

      <!-- resolving indicator -->
      <view v-if="resolving" class="state-text">正在获取坐标…</view>

      <!-- list -->
      <scroll-view v-else scroll-y class="item-scroll">
        <view class="item-list">
          <button
            v-for="name in currentList"
            :key="name"
            class="list-item"
            :class="{ selected: name === currentSelected }"
            @tap="selectItem(name)"
          >
            <text>{{ name }}</text>
            <text v-if="name === currentSelected" class="check">✓</text>
          </button>
          <view v-if="!currentList.length" class="state-text">
            {{ activeTab === 'city' ? '请先选择省份' : activeTab === 'district' ? '请先选择城市' : '' }}
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.picker-page { height: 100vh; display: flex; flex-direction: column; background: #f7f7f5; color: #141414; }

.picker-header { background: #fff; border-bottom: 1rpx solid rgba(20, 20, 20, .06); padding: 16rpx 32rpx 24rpx; }
.search-bar { display: flex; align-items: center; gap: 16rpx; height: 80rpx; padding: 0 24rpx; border-radius: 999rpx; background: #f2f2f0; }
.search-input { flex: 1; height: 80rpx; font-size: 30rpx; font-weight: 600; }
.clear-btn { width: 40rpx; height: 40rpx; display: flex; align-items: center; justify-content: center; color: #999; font-size: 24rpx; }

.action-row { padding: 20rpx 32rpx 0; }
.locate-action {
  display: flex; align-items: center; gap: 16rpx; width: 100%;
  padding: 28rpx 24rpx; border-radius: 24rpx; background: #fff;
  border: 1rpx solid rgba(20, 20, 20, .05); text-align: left;
}
.action-label { font-size: 30rpx; font-weight: 700; }
.action-detail { margin-left: auto; font-size: 26rpx; color: #7a7a77; }

/* ── browse area ── */
.browse-area { flex: 1; display: flex; flex-direction: column; min-height: 0; }

.tab-bar {
  display: flex; gap: 0; padding: 0 32rpx; margin-top: 20rpx;
  background: #fff; border-bottom: 1rpx solid rgba(20, 20, 20, .06);
}
.tab-item {
  flex: 1; padding: 24rpx 0; font-size: 28rpx; font-weight: 700;
  color: #7a7a77; border: none; background: transparent;
  border-bottom: 4rpx solid transparent; text-align: center;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.tab-item.active { color: #141414; border-bottom-color: #141414; }
.tab-item.disabled { color: #ccc; }

.item-scroll { flex: 1; }
.item-list { padding: 16rpx 32rpx 40rpx; }
.list-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 28rpx 24rpx; margin-bottom: 8rpx;
  border-radius: 20rpx; background: #fff;
  border: 1rpx solid rgba(20, 20, 20, .04);
  font-size: 30rpx; font-weight: 600; text-align: left;
}
.list-item.selected { color: #141414; background: #f0f0ee; border-color: rgba(20, 20, 20, .1); }
.check { color: #141414; font-weight: 800; font-size: 28rpx; }

.picker-body { flex: 1; padding: 24rpx 32rpx; overflow-y: auto; }
.state-text { padding: 60rpx 0; text-align: center; color: #9b9b98; font-size: 28rpx; }

.result-list { display: flex; flex-direction: column; gap: 16rpx; }
.result-item {
  display: flex; flex-direction: column; gap: 8rpx; width: 100%;
  padding: 24rpx; border-radius: 20rpx; background: #fff;
  border: 1rpx solid rgba(20, 20, 20, .05); text-align: left;
}
.result-title { font-size: 30rpx; font-weight: 700; letter-spacing: -0.5rpx; }
.result-address { font-size: 24rpx; color: #7a7a77; line-height: 1.4; }
</style>
