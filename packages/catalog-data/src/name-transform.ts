const EXACT_REWRITE: Record<string, string> = {
  '麦当劳': '麦当隆',
  '肯德基': '肯得基',
  '汉堡王': '汉堡旺',
  '华莱士': '华莱仕',
  '必胜客': '必盛客',
  '瑞幸咖啡': '瑞幸咖啡社',
  '星巴克': '星巴客',
  '喜茶': '喜茗',
  '奈雪的茶': '奈雪茶',
  '茶百道': '茶佰道',
  '沪上阿姨': '沪上阿宜',
  '古茗': '古茗町',
  '霸王茶姬': '霸王茶叽',
  '蜜雪冰城': '蜜雪冰橙',
};

const SUFFIX_REWRITE: Record<string, string> = {
  王: '旺',
  士: '仕',
  基: '吉',
  客: '刻',
  家: '佳',
  记: '纪',
  店: '点',
  屋: '坞',
  院: '苑',
  馆: '阁',
  庄: '桩',
  轩: '宣',
  吧: '捌',
  亭: '庭',
  语: '雨',
  铺: '圃',
  堂: '棠',
};

export function transformStoreName(name: string): string {
  const normalized = name.trim();
  if (!normalized) return name;

  const exact = EXACT_REWRITE[normalized];
  if (exact) return exact;

  const lastChar = normalized.at(-1) ?? '';
  const replacement = SUFFIX_REWRITE[lastChar];
  if (replacement) return `${normalized.slice(0, -1)}${replacement}`;

  return normalized;
}
