import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Sun, Moon, Sunset, Sparkles, Palette, Compass, Volume2, VolumeX,
  User, Users, Smile, Eye, Flame, MessageCircle, ChevronUp,
  ChevronDown, Send, Sprout, Trophy, Unlock, Lock, Trash2, X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  collection,
  deleteDoc,
  runTransaction
} from 'firebase/firestore';

// ============================================================================
// MODULE 1: CẤU HÌNH FIREBASE & QUẢN LÝ KẾT NỐI ĐỒNG BỘ MULTIPLAYER
// ============================================================================
const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'adiva-chibi-world-3d';
let auth = null;
let db = null;

try {
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };
  if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId) {
    const firebaseApp = initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
  } else {
    console.info('Firebase chưa được cấu hình: chỉ bật chế độ cùng trình duyệt.');
  }
} catch (err) {
  console.warn('Không thể khởi tạo Firebase:', err);
}

// ============================================================================
// MODULE 2: BỘ TỔNG HỢP ÂM THANH WEBAUDIO (KHÔNG CẦN FILE ÂM THANH NGOÀI)
// ============================================================================
const soundFX = {
  ctx: null,
  enabled: true,
  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  },
  playTone(freq = 520, duration = 0.12, type = 'sine', gainVal = 0.08) {
    if (!this.enabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Bỏ qua nếu trình duyệt chặn autoplay
    }
  },
  playClick() {
    this.playTone(660, 0.08, 'sine', 0.06);
  },
  playJump() {
    this.playTone(440, 0.16, 'triangle', 0.08);
    setTimeout(() => this.playTone(680, 0.14, 'triangle', 0.07), 60);
  },
  playEmote() {
    this.playTone(587, 0.1, 'sine', 0.07);
    setTimeout(() => this.playTone(880, 0.16, 'sine', 0.07), 90);
  },
  playHarvest() {
    this.playTone(523, 0.1, 'triangle', 0.08);
    setTimeout(() => this.playTone(659, 0.1, 'triangle', 0.08), 80);
    setTimeout(() => this.playTone(784, 0.18, 'triangle', 0.09), 160);
  },
  playBell() {
    this.playTone(432, 0.65, 'sine', 0.1);
  },
  playFirework() {
    this.playTone(320, 0.18, 'sawtooth', 0.06);
    setTimeout(() => this.playTone(760, 0.25, 'sine', 0.08), 120);
  }
};

// ============================================================================
// MODULE 3: DỮ LIỆU 12 CON GIÁP CHIBI 3D, 6 PET CẤP S & CÁC HỆ THỐNG GAME
// ============================================================================
const DEFAULT_NATURE_COLORS = {
  sakuraColor: '#ffb7c5',
  treeFoliageColor: '#22c55e',
  flowerBedColor: '#f472b6',
  lanternGlowColor: '#fde047',
  waterTint: '#0ea5e9'
};

const ZODIAC_CHARACTERS = [
  {
    id: 'ty_mouse',
    zodiac: 'Tý – Chuột',
    title: 'Kỹ Sư Công Nghệ Tí Hon',
    description: 'Nhanh nhẹn, thông minh với bộ giáp công nghệ xanh dương phát sáng.',
    primaryColor: '#38bdf8',
    secondaryColor: '#0284c7',
    accentColor: '#fde047',
    skinColor: '#ffe4d6',
    eyeColor: '#0ea5e9',
    earType: 'mouse',
    speedBonus: 1.15
  },
  {
    id: 'suu_buffalo',
    zodiac: 'Sửu – Trâu',
    title: 'Hộ Vệ Giáp Kim Cương',
    description: 'Mạnh mẽ, đáng tin cậy với cặp sừng vàng kim và giáp hộ vệ vững chắc.',
    primaryColor: '#818cf8',
    secondaryColor: '#4f46e5',
    accentColor: '#facc15',
    skinColor: '#ffedd5',
    eyeColor: '#6366f1',
    earType: 'horns_buffalo',
    speedBonus: 1.0
  },
  {
    id: 'dan_tiger',
    zodiac: 'Dần – Hổ',
    title: 'Chiến Binh Hỏa Quang',
    description: 'Năng động, cá tính trong bộ giáp chiến binh cam lửa đầy nhiệt huyết.',
    primaryColor: '#fb923c',
    secondaryColor: '#ea580c',
    accentColor: '#fef08a',
    skinColor: '#ffe4d6',
    eyeColor: '#f97316',
    earType: 'tiger',
    speedBonus: 1.12
  },
  {
    id: 'mao_cat',
    zodiac: 'Mão – Mèo',
    title: 'Pháp Sư Tinh Nghịch Pastel',
    description: 'Dễ thương, tinh nghịch với đôi tai mèo hồng phấn và phép thuật cổ tích.',
    primaryColor: '#f472b6',
    secondaryColor: '#db2777',
    accentColor: '#a7f3d0',
    skinColor: '#fff1f2',
    eyeColor: '#ec4899',
    earType: 'cat',
    speedBonus: 1.1
  },
  {
    id: 'thin_dragon',
    zodiac: 'Thìn – Rồng',
    title: 'Long Thần Tinh Tú',
    description: 'Huyền bí, uy nghiêm với sừng rồng ngọc bích và đôi cánh ánh sáng năng lượng.',
    primaryColor: '#2dd4bf',
    secondaryColor: '#0d9488',
    accentColor: '#fde047',
    skinColor: '#f0fdfa',
    eyeColor: '#14b8a6',
    earType: 'dragon_horns',
    speedBonus: 1.15
  },
  {
    id: 'ty_snake',
    zodiac: 'Tỵ – Rắn',
    title: 'Học Giả Ánh Kim',
    description: 'Thanh lịch, thông thái trong trang phục hoàng kim pha lục bảo huyền ảo.',
    primaryColor: '#4ade80',
    secondaryColor: '#16a34a',
    accentColor: '#facc15',
    skinColor: '#fef9c3',
    eyeColor: '#22c55e',
    earType: 'crown_fin',
    speedBonus: 1.08
  },
  {
    id: 'ngo_horse',
    zodiac: 'Ngọ – Ngựa',
    title: 'Kỵ Sĩ Tốc Độ Ánh Chớp',
    description: 'Năng động, thể thao với trang phục bức phá tốc độ đỏ rực rỡ.',
    primaryColor: '#f87171',
    secondaryColor: '#dc2626',
    accentColor: '#fde047',
    skinColor: '#ffe4d6',
    eyeColor: '#ef4444',
    earType: 'horse',
    speedBonus: 1.2
  },
  {
    id: 'mui_goat',
    zodiac: 'Mùi – Dê',
    title: 'Sứ Giả Thảo Nguyên Xanh',
    description: 'Hiền lành, đáng yêu với cặp sừng xoắn mềm mại và trang phục thiên nhiên.',
    primaryColor: '#a3e635',
    secondaryColor: '#65a30d',
    accentColor: '#fef08a',
    skinColor: '#fffbeb',
    eyeColor: '#84cc16',
    earType: 'ram_horns',
    speedBonus: 1.05
  },
  {
    id: 'than_monkey',
    zodiac: 'Thân – Khỉ',
    title: 'Nhà Phát Minh Vũ Trụ',
    description: 'Tinh nghịch, vui nhộn với bộ đồ phi hành gia công nghệ vàng cam.',
    primaryColor: '#facc15',
    secondaryColor: '#ca8a04',
    accentColor: '#38bdf8',
    skinColor: '#ffedd5',
    eyeColor: '#eab308',
    earType: 'monkey',
    speedBonus: 1.14
  },
  {
    id: 'dau_rooster',
    zodiac: 'Dậu – Gà',
    title: 'Ca Sĩ Ánh Sáng Rực Rỡ',
    description: 'Nổi bật, cá tính với mào vương miện phát sáng và trang phục lễ hội.',
    primaryColor: '#fb7185',
    secondaryColor: '#e11d48',
    accentColor: '#fde047',
    skinColor: '#fff1f2',
    eyeColor: '#f43f5e',
    earType: 'rooster_crest',
    speedBonus: 1.08
  },
  {
    id: 'tuat_dog',
    zodiac: 'Tuất – Chó',
    title: 'Đội Trưởng Cảnh Vệ Trung Thành',
    description: 'Thân thiện, trung thành trong trang phục bảo vệ công viên ADIVA.',
    primaryColor: '#60a5fa',
    secondaryColor: '#2563eb',
    accentColor: '#fbbf24',
    skinColor: '#ffedd5',
    eyeColor: '#3b82f6',
    earType: 'dog',
    speedBonus: 1.1
  },
  {
    id: 'hoi_pig',
    zodiac: 'Hợi – Heo',
    title: 'Đầu Bếp Ngọt Ngào Đáng Yêu',
    description: 'Vui vẻ, phúc hậu với chiếc mũi hồng xinh xắn và trang phục kẹo ngọt.',
    primaryColor: '#f9a8d4',
    secondaryColor: '#ec4899',
    accentColor: '#fde047',
    skinColor: '#fff1f2',
    eyeColor: '#db2777',
    earType: 'pig',
    speedBonus: 1.05
  }
];

const PET_COMPANIONS = [
  {
    id: 'fairy_butterfly',
    name: 'Bướm Tiên Ánh Sao',
    type: 'butterfly',
    color: '#f472b6',
    secondaryColor: '#fbcfe8',
    wingColor: '#f9a8d4',
    glow: '#fde047',
    desc: '4 cánh pha lê viền vàng kim lấp lánh, rải bụi sao dẫn đường ban đêm.'
  },
  {
    id: 'jade_dragonfly',
    name: 'Chuồn Chuồn Ngọc Bích',
    type: 'dragonfly',
    color: '#2dd4bf',
    secondaryColor: '#99f6e4',
    wingColor: '#5eead4',
    glow: '#38bdf8',
    desc: 'Thân ngọc bích 4 đốt thon dài đính tinh thể, 4 cánh mỏng trong suốt.'
  },
  {
    id: 'spirit_firefly',
    name: 'Đom Đóm Tinh Linh Vương',
    type: 'firefly',
    color: '#facc15',
    secondaryColor: '#fef08a',
    wingColor: '#fde047',
    glow: '#fef08a',
    desc: 'Mang chiếc lồng đèn pha lê phát sáng rực rỡ bọc khung vàng hoàng gia.'
  },
  {
    id: 'cyber_bee',
    name: 'Ong Chúa Điện Tử Cyber',
    type: 'bee',
    color: '#f59e0b',
    secondaryColor: '#1e293b',
    wingColor: '#38bdf8',
    glow: '#38bdf8',
    desc: 'Thân sọc kim loại vàng đen, đeo kính năng lượng Visor và ngòi pha lê.'
  },
  {
    id: 'diamond_beetle',
    name: 'Bọ Cánh Cứng Kim Cương',
    type: 'beetle',
    color: '#a855f7',
    secondaryColor: '#e9d5ff',
    wingColor: '#c084fc',
    glow: '#f472b6',
    desc: 'Giáp lưng nạm kim cương tím cùng chiếc sừng đại vương Hercules uy dũng.'
  },
  {
    id: 'galaxy_moth',
    name: 'Bướm Đêm Ngân Hà',
    type: 'moth',
    color: '#6366f1',
    secondaryColor: '#ffffff',
    wingColor: '#818cf8',
    glow: '#a7f3d0',
    desc: 'Cổ lông vũ trắng muốt quý phái cùng đôi cánh Luna Moth có dải đuôi dài.'
  }
];

const CHARACTER_ACCESSORIES = [
  { id: 'none', name: 'Mặc Định', price: 0 },
  { id: 'star_crown', name: '👑 Vương Miện Ánh Sao', price: 150 },
  { id: 'cyber_wings', name: '🦋 Đôi Cánh Pha Lê Cyber', price: 250 },
  { id: 'lotus_cape', name: '🪷 Vòng Hoa Sen Hộ Thể', price: 200 }
];

const WORLD_LANDMARKS = [
  {
    id: 'plaza',
    name: 'Quảng Trường Địa Cầu ADIVA',
    desc: 'Trung tâm công viên với Quả Địa Cầu 3D xoay và bệ tập trung 4 người.',
    x: 0,
    z: 0,
    color: '#38bdf8'
  },
  {
    id: 'camping',
    name: 'Khu Cắm Trại & Quầy Pháo Hoa',
    desc: 'Lều trại ven suối, bếp lửa BBQ và quầy bán pháo hoa đêm.',
    x: -22,
    z: 25,
    color: '#f97316'
  },
  {
    id: 'garden',
    name: 'Khu Vườn 3D & Nhà Riêng',
    desc: '12 ô đất trồng hoa, rau củ 3D và căn nhà riêng có thể nâng cấp.',
    x: 24,
    z: 25,
    color: '#4ade80'
  },
  {
    id: 'pagoda',
    name: 'Chùa Liên Hoa Việt Nam',
    desc: 'Ngôi chùa mái cong Á Đông truyền thống, nơi thắp hương và ngồi thiền.',
    x: -28,
    z: -20,
    color: '#facc15'
  },
  {
    id: 'church',
    name: 'Nhà Thờ Cổ Tích Châu Âu',
    desc: 'Kiến trúc tháp chuông cổ tích với cửa kính màu lung linh.',
    x: 28,
    z: -20,
    color: '#a855f7'
  },
  {
    id: 'tower',
    name: 'Tháp Ngắm Cảnh Toàn Công Viên',
    desc: 'Tòa tháp cao 13.5m có thang máy đưa người chơi lên ngắm toàn cảnh.',
    x: 0,
    z: -32,
    color: '#f43f5e'
  },
  {
    id: 'folk_zone',
    name: 'Khu Trò Chơi Dân Gian & Văn Hóa',
    desc: 'Sân chơi Ô ăn quan, Cờ caro, Kéo búa bao và Hành trình Văn hóa Việt.',
    x: -24,
    z: 2,
    color: '#ec4899'
  }
];

const BBQ_FOODS = [
  {
    id: 'honey_skewers',
    name: 'Thịt Xiên Nướng Mật Ong',
    icon: '🍢',
    cost: 20,
    rewardCoins: 45,
    exp: 20,
    timeSec: 3
  },
  {
    id: 'marshmallow',
    name: 'Kẹo Bông Gòn Marshmallow',
    icon: '🍡',
    cost: 15,
    rewardCoins: 35,
    exp: 15,
    timeSec: 2
  },
  {
    id: 'sweet_potato',
    name: 'Khoai Lang Mật Nướng Than',
    icon: '🍠',
    cost: 25,
    rewardCoins: 55,
    exp: 25,
    timeSec: 3
  },
  {
    id: 'grilled_corn',
    name: 'Ngô Nướng Mỡ Hành',
    icon: '🌽',
    cost: 30,
    rewardCoins: 65,
    exp: 30,
    timeSec: 4
  }
];

const FIREWORK_ITEMS = [
  {
    id: 'fw_rainbow',
    name: 'Pháo Hoa Ngũ Sắc ADIVA',
    desc: 'Nổ 4 chùm pháo hoa 5 màu rực rỡ phản chiếu mặt nước.',
    cost: 30,
    bursts: 4,
    colors: [0xf472b6, 0x38bdf8, 0xfacc15, 0x4ade80, 0xa855f7]
  },
  {
    id: 'fw_heart',
    name: 'Pháo Hoa Hồng Tâm Tình Bạn',
    desc: 'Sắc hồng phấn và ánh kim lãng mạn trên bầu trời đêm.',
    cost: 45,
    bursts: 5,
    colors: [0xfb7185, 0xf43f5e, 0xfde047, 0xf9a8d4]
  },
  {
    id: 'fw_dragon',
    name: 'Pháo Hoa Kim Long Thịnh Vượng',
    desc: 'Rồng vàng và ngọc bích tỏa sáng khắp thung lũng.',
    cost: 60,
    bursts: 6,
    colors: [0xfacc15, 0xf59e0b, 0x2dd4bf, 0x38bdf8]
  },
  {
    id: 'fw_grand',
    name: 'Đại Tiệc Pháo Hoa ADIVA (10 Đợt)',
    desc: 'Màn trình diễn pháo hoa liên hoàn 10 đợt hoành tráng cho cả 4 người!',
    cost: 100,
    bursts: 10,
    colors: [0xf472b6, 0x38bdf8, 0xfacc15, 0x4ade80, 0xa855f7, 0xf97316]
  }
];

const GARDEN_CROPS = [
  { id: 'rose', name: 'Hoa Hồng Đỏ', icon: '🌹', cost: 15, sell: 40, exp: 15, color: '#f43f5e' },
  { id: 'sakura', name: 'Hoa Đào Xuân', icon: '🌸', cost: 20, sell: 50, exp: 20, color: '#f472b6' },
  { id: 'sunflower', name: 'Hoa Hướng Dương', icon: '🌻', cost: 25, sell: 60, exp: 22, color: '#facc15' },
  { id: 'lotus', name: 'Hoa Sen Hồng', icon: '🪷', cost: 30, sell: 75, exp: 28, color: '#ec4899' },
  { id: 'tulip', name: 'Hoa Tulip Tím', icon: '🌷', cost: 22, sell: 55, exp: 20, color: '#a855f7' },
  { id: 'daisy', name: 'Hoa Cúc Vàng', icon: '🌼', cost: 18, sell: 45, exp: 18, color: '#fde047' },
  { id: 'strawberry', name: 'Dâu Tây Mọng', icon: '🍓', cost: 28, sell: 70, exp: 25, color: '#ef4444' },
  { id: 'tomato', name: 'Cà Chua Đỏ', icon: '🍅', cost: 20, sell: 48, exp: 18, color: '#dc2626' },
  { id: 'carrot', name: 'Cà Rốt Giòn', icon: '🥕', cost: 18, sell: 45, exp: 16, color: '#f97316' },
  { id: 'pumpkin', name: 'Bí Ngô Hoàng Kim', icon: '🎃', cost: 35, sell: 90, exp: 35, color: '#ea580c' },
  { id: 'chili', name: 'Ớt Chỉ Thiên', icon: '🌶️', cost: 15, sell: 38, exp: 14, color: '#b91c1c' },
  { id: 'golden_apple', name: 'Cây Táo Vàng', icon: '🍎', cost: 45, sell: 120, exp: 45, color: '#eab308' }
];

const SOCIAL_EMOTES = [
  { id: 'wave', label: 'Vẫy Tay Chào', emoji: '👋' },
  { id: 'jump_joy', label: 'Nhảy Vui Vẻ', emoji: '🙌' },
  { id: 'celebrate', label: 'Ăn Mừng', emoji: '🎉' },
  { id: 'sit', label: 'Ngồi Xuống', emoji: '🪑' },
  { id: 'lie_down', label: 'Nằm Thư Giãn', emoji: '🌿' },
  { id: 'laugh', label: 'Cười Tươi', emoji: '😄' },
  { id: 'cry', label: 'Khóc Nhè', emoji: '😭' },
  { id: 'surprised', label: 'Ngạc Nhiên', emoji: '😲' },
  { id: 'tease', label: 'Chọc Quê', emoji: '😜' },
  { id: 'bonk', label: 'Gõ Đầu Vui', emoji: '🔨' },
  { id: 'handshake', label: 'Bắt Tay', emoji: '🤝' },
  { id: 'highfive', label: 'High-Five', emoji: '✋' },
  { id: 'hug', label: 'Ôm Thắm Thiết', emoji: '🫂' },
  { id: 'dance', label: 'Nhảy Múa', emoji: '💃' },
  { id: 'photo', label: 'Chụp Ảnh Chung', emoji: '📸' }
];

const PROVERB_RIDDLES = [
  {
    icons: '🌊 🚰 🤔 🏞️',
    hint: 'Câu tục ngữ nhắc nhở lòng biết ơn người đi trước.',
    answer: 'Uống nước nhớ nguồn',
    options: ['Uống nước nhớ nguồn', 'Ăn quả nhớ kẻ trồng cây', 'Tôn sư trọng đạo', 'Lá lành đùm lá rách']
  },
  {
    icons: '🍃 💚 🤲 🍂',
    hint: 'Tinh thần tương thân tương ái, giúp đỡ nhau lúc khó khăn.',
    answer: 'Lá lành đùm lá rách',
    options: ['Lá lành đùm lá rách', 'Một cây làm chẳng nên non', 'Có công mài sắt có ngày nên kim', 'Đi một ngày đàng']
  },
  {
    icons: '🌲 🌲 🌲 ➡️ ⛰️',
    hint: 'Sức mạnh của sự đoàn kết giữa những người bạn.',
    answer: 'Ba cây chụm lại nên hòn núi cao',
    options: [
      'Ba cây chụm lại nên hòn núi cao',
      'Gần mực thì đen gần đèn thì rạng',
      'Tốt gỗ hơn tốt nước sơn',
      'Lời nói chẳng mất tiền mua'
    ]
  }
];

const CULTURAL_QUESTIONS = [
  {
    q: 'Trong 12 con giáp Việt Nam, con giáp nào đứng ở vị trí thứ 4 (khác với Thỏ ở một số nước Á Đông)?',
    options: ['Mão – Con Mèo', 'Dần – Con Hổ', 'Thìn – Con Rồng', 'Mùi – Con Dê'],
    answer: 0,
    relic: 'Mèo Ngọc Bích Cổ Đại',
    explain: 'Trong văn hóa Việt Nam, con giáp thứ 4 là Mão (Con Mèo).'
  },
  {
    q: 'Trò chơi dân gian nào sử dụng 2 ô lớn ở hai đầu và 10 ô nhỏ ở giữa cùng các viên sỏi?',
    options: ['Ô Ăn Quan', 'Cờ Cá Ngựa', 'Rồng Rắn Lên Mây', 'Nhảy Sạp'],
    answer: 0,
    relic: 'Bàn Ô Ăn Quan Hoàng Gia',
    explain: 'Ô Ăn Quan là trò chơi dân gian trí tuệ gắn liền với tuổi thơ Việt Nam.'
  },
  {
    q: 'Loài hoa nào được mệnh danh là Quốc hoa tinh thần của Việt Nam, thường nở trong hồ nước mùa hạ?',
    options: ['Hoa Sen Hồng', 'Hoa Cúc Vàng', 'Hoa Hướng Dương', 'Hoa Tulip'],
    answer: 0,
    relic: 'Đài Sen Vàng Chùa Một Cột',
    explain: 'Hoa Sen tượng trưng cho sự thanh cao, thuần khiết của tâm hồn Việt.'
  },
  {
    q: 'Bánh Chưng truyền thống trong dịp Tết Nguyên Đán có hình dáng gì và tượng trưng cho điều gì?',
    options: ['Hình vuông – Tượng trưng cho Đất', 'Hình tròn – Tượng trưng cho Trời', 'Hình tam giác', 'Hình lục giác'],
    answer: 0,
    relic: 'Bánh Chưng Lang Liêu',
    explain: 'Theo sự tích Lang Liêu, Bánh Chưng hình vuông tượng trưng cho Đất mẹ.'
  },
  {
    q: 'Nhạc cụ cổ truyền nào của Việt Nam chỉ có duy nhất 1 dây nhưng tạo ra âm thanh vô cùng sâu lắng?',
    options: ['Đàn Bầu (Độc Huyền Cầm)', 'Đàn Tranh', 'Đàn Tỳ Bà', 'Sáo Trúc'],
    answer: 0,
    relic: 'Đàn Bầu Khảm Trai',
    explain: 'Đàn Bầu (Độc Huyền Cầm) là nhạc cụ độc đáo bậc nhất của âm nhạc dân tộc Việt Nam.'
  }
];

// ============================================================================
// MODULE 4: BỘ TẠO TEXTURE 3D CHO QUẢ ĐỊA CẦU & DẢI CHỮ ADIVA CHIBI WORLD
// ============================================================================
function createGlobeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, '#0ea5e9');
  grad.addColorStop(1, '#0369a1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);

  // Vẽ các lục địa xanh tươi cách điệu
  ctx.fillStyle = '#4ade80';
  const continents = [
    [90, 80, 55, 42],
    [160, 145, 45, 55],
    [270, 75, 75, 48],
    [350, 125, 65, 50],
    [430, 85, 48, 36]
  ];
  continents.forEach(([x, y, rx, ry]) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0.2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Đường vĩ tuyến & kinh tuyến ánh sáng
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  for (let y = 32; y < 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  for (let x = 64; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  return new THREE.CanvasTexture(canvas);
}

function createAdivaBannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(0, 18, 1024, 92);

  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 18, 1024, 92);

  ctx.font = '900 46px "Segoe UI", sans-serif';
  ctx.fillStyle = '#fde047';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦ ADIVA CHIBI WORLD ✦ ADIVA CHIBI WORLD ✦', 512, 64);

  return new THREE.CanvasTexture(canvas);
}

// ============================================================================
// MODULE 5: BỘ XÂY DỰNG MÔ HÌNH 3D NHÂN VẬT CHIBI 12 CON GIÁP & PET CẤP S
// ============================================================================
function buildPremiumPetMesh(petConfig) {
  const petGroup = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: petConfig.color,
    emissive: petConfig.glow,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.35
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: petConfig.secondaryColor || '#ffffff',
    roughness: 0.25,
    metalness: 0.2
  });

  const glowMat = new THREE.MeshBasicMaterial({
    color: petConfig.glow
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: '#fde047',
    emissive: '#f59e0b',
    emissiveIntensity: 0.5,
    metalness: 0.85,
    roughness: 0.15
  });

  const wingMat = new THREE.MeshStandardMaterial({
    color: petConfig.wingColor,
    emissive: petConfig.glow,
    emissiveIntensity: 0.55,
    transparent: true,
    opacity: 0.84,
    side: THREE.DoubleSide,
    roughness: 0.15
  });

  // 1. Đầu Pet Chibi Đáng Yêu (Có mắt to long lanh, má hồng, râu phát sáng & vương miện nhỏ)
  const head = new THREE.Group();
  head.position.set(0, 0.16, 0.18);
  petGroup.add(head);

  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 20), bodyMat);
  headSphere.scale.set(1.08, 0.96, 1.0);
  head.add(headSphere);

  // Mắt to long lanh + Đốm sáng trắng + Má hồng
  const eyeDarkMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
  const eyeShineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blushMat = new THREE.MeshBasicMaterial({ color: '#fb7185', transparent: true, opacity: 0.65 });

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 12), eyeDarkMat);
    eye.position.set(side * 0.068, 0.015, 0.14);
    eye.scale.set(0.9, 1.2, 0.5);
    head.add(eye);

    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), eyeShineMat);
    shine.position.set(side * 0.075, 0.03, 0.158);
    head.add(shine);

    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), blushMat);
    blush.scale.set(1.3, 0.6, 0.4);
    blush.position.set(side * 0.1, -0.025, 0.135);
    head.add(blush);

    // Râu linh thú uốn cong có ngọc phát sáng ở đỉnh
    const antStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.18, 8), goldMat);
    antStem.position.set(side * 0.06, 0.19, 0.05);
    antStem.rotation.z = side * -0.38;
    antStem.rotation.x = 0.35;
    head.add(antStem);

    const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), glowMat);
    antTip.position.set(side * 0.1, 0.27, 0.09);
    head.add(antTip);
  });

  // Vương miện / Vòng hào quang tí hon trên đỉnh đầu Pet
  const miniCrown = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 20), goldMat);
  miniCrown.rotation.x = Math.PI / 2;
  miniCrown.position.set(0, 0.17, 0);
  head.add(miniCrown);

  // 2. Hai Nhóm Cánh Trái & Phải (Để đập cánh mượt mà trong vòng lặp Animation)
  const leftWingGroup = new THREE.Group();
  leftWingGroup.position.set(-0.08, 0.12, 0);
  petGroup.add(leftWingGroup);

  const rightWingGroup = new THREE.Group();
  rightWingGroup.position.set(0.08, 0.12, 0);
  petGroup.add(rightWingGroup);

  // 3. Tạo Hình Chi Tiết Riêng Biệt Theo Từng Loài Pet Cấp S
  if (petConfig.type === 'butterfly') {
    // BƯỚM TIÊN ÁNH SAO: Thân thon thanh mảnh + 4 cánh pha lê viền vàng lấp lánh
    const thorax = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.18, 10, 14), secondaryMat);
    thorax.rotation.x = Math.PI / 2.4;
    petGroup.add(thorax);

    const buildButterflySide = (isLeft) => {
      const s = isLeft ? -1 : 1;
      const sideHolder = new THREE.Group();

      // Cánh lớn phía trên
      const upperWing = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), wingMat);
      upperWing.scale.set(1.15, 0.82, 1);
      upperWing.position.set(s * 0.24, 0.12, 0.02);
      upperWing.rotation.z = s * -0.35;
      sideHolder.add(upperWing);

      const upperRim = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.32, 20), goldMat);
      upperRim.scale.set(1.15, 0.82, 1);
      upperRim.position.copy(upperWing.position);
      upperRim.rotation.copy(upperWing.rotation);
      sideHolder.add(upperRim);

      // Cánh giọt nước phía dưới
      const lowerWing = new THREE.Mesh(new THREE.CircleGeometry(0.22, 18), wingMat);
      lowerWing.scale.set(0.95, 1.15, 1);
      lowerWing.position.set(s * 0.18, -0.1, -0.1);
      lowerWing.rotation.z = s * 0.45;
      sideHolder.add(lowerWing);

      // Ngọc ánh sao đính trên cánh
      const starGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), glowMat);
      starGem.position.set(s * 0.26, 0.12, 0.04);
      sideHolder.add(starGem);

      return sideHolder;
    };

    leftWingGroup.add(buildButterflySide(true));
    rightWingGroup.add(buildButterflySide(false));
  } else if (petConfig.type === 'dragonfly') {
    // CHUỒN CHUỒN NGỌC BÍCH: Thân ngọc nối nhiều đốt thon dài + 4 cánh chuồn chuồn trong suốt
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), bodyMat);
    thorax.scale.set(0.9, 0.9, 1.3);
    petGroup.add(thorax);

    for (let seg = 1; seg <= 4; seg++) {
      const segMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09 - seg * 0.014, 12, 12),
        seg % 2 === 0 ? secondaryMat : bodyMat
      );
      segMesh.scale.set(0.85, 0.85, 1.5);
      segMesh.position.set(0, 0.02 - seg * 0.02, -0.12 - seg * 0.13);
      petGroup.add(segMesh);
    }

    const tailCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glowMat);
    tailCrystal.position.set(0, -0.07, -0.72);
    petGroup.add(tailCrystal);

    const buildDragonflySide = (isLeft) => {
      const s = isLeft ? -1 : 1;
      const sideHolder = new THREE.Group();

      const foreWing = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), wingMat);
      foreWing.scale.set(1.55, 0.34, 1);
      foreWing.position.set(s * 0.34, 0.08, 0.04);
      foreWing.rotation.z = s * -0.18;
      sideHolder.add(foreWing);

      const hindWing = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), wingMat);
      hindWing.scale.set(1.4, 0.32, 1);
      hindWing.position.set(s * 0.3, 0.02, -0.12);
      hindWing.rotation.z = s * 0.22;
      sideHolder.add(hindWing);

      return sideHolder;
    };

    leftWingGroup.add(buildDragonflySide(true));
    rightWingGroup.add(buildDragonflySide(false));
  } else if (petConfig.type === 'firefly') {
    // ĐOM ĐÓM TINH LINH VƯƠNG: Bụng lồng đèn pha lê phát sáng rực rỡ bọc khung vàng
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), secondaryMat);
    petGroup.add(thorax);

    const lanternBelly = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 20), glowMat);
    lanternBelly.scale.set(0.95, 0.95, 1.25);
    lanternBelly.position.set(0, -0.05, -0.2);
    petGroup.add(lanternBelly);

    const cageRing = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.016, 8, 24), goldMat);
    cageRing.position.copy(lanternBelly.position);
    petGroup.add(cageRing);

    [-1, 1].forEach((s) => {
      const targetGroup = s === -1 ? leftWingGroup : rightWingGroup;
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.26, 18), wingMat);
      wing.scale.set(1.2, 0.72, 1);
      wing.position.set(s * 0.24, 0.09, -0.04);
      wing.rotation.z = s * -0.25;
      targetGroup.add(wing);
    });
  } else if (petConfig.type === 'bee') {
    // ONG CHÚA ĐIỆN TỬ CYBER: Thân tròn sọc vàng-xanh neon + kính Visor + ngòi pha lê
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 20), bodyMat);
    abdomen.scale.set(0.95, 0.95, 1.35);
    abdomen.position.set(0, -0.02, -0.08);
    petGroup.add(abdomen);

    // Các vòng sọc vàng đặc trưng của Ong Chúa
    [-0.02, -0.12, -0.22].forEach((zPos, idx) => {
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.145 - idx * 0.018, 0.022, 10, 24),
        goldMat
      );
      stripe.position.set(0, -0.02, zPos);
      petGroup.add(stripe);
    });

    // Ngòi pha lê phát sáng phía sau
    const stinger = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 10), goldMat);
    stinger.rotation.x = -Math.PI / 2;
    stinger.position.set(0, -0.02, -0.34);
    petGroup.add(stinger);

    // Kính Cyber Visor trên trán Ong Chúa
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.055, 0.06),
      new THREE.MeshBasicMaterial({ color: '#fef08a' })
    );
    visor.position.set(0, 0.05, 0.15);
    head.add(visor);

    [-1, 1].forEach((s) => {
      const targetGroup = s === -1 ? leftWingGroup : rightWingGroup;
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), wingMat);
      wing.scale.set(1.25, 0.65, 1);
      wing.position.set(s * 0.22, 0.11, -0.02);
      wing.rotation.z = s * -0.3;
      targetGroup.add(wing);
    });
  } else if (petConfig.type === 'beetle') {
    // BỌ CÁNH CỨNG KIM CƯƠNG: Giáp lưng kim cương + Sừng đại vương Hercules phát sáng
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 20), bodyMat);
    shell.scale.set(1.05, 0.85, 1.35);
    shell.position.set(0, 0, -0.08);
    petGroup.add(shell);

    // Sừng Đại Vương cong uy dũng trên trán
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 10), goldMat);
    horn.position.set(0, 0.16, 0.22);
    horn.rotation.x = 0.65;
    head.add(horn);

    // Đá kim cương nạm trên lưng
    const backGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), glowMat);
    backGem.position.set(0, 0.16, -0.08);
    petGroup.add(backGem);

    [-1, 1].forEach((s) => {
      const targetGroup = s === -1 ? leftWingGroup : rightWingGroup;
      // Vỏ cánh cứng mở sang hai bên + Cánh năng lượng bên dưới
      const hardShell = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 14, 14, 0, Math.PI, 0, Math.PI / 2),
        bodyMat
      );
      hardShell.position.set(s * 0.16, 0.12, -0.08);
      hardShell.rotation.z = s * -0.55;
      targetGroup.add(hardShell);

      const innerWing = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16), wingMat);
      innerWing.scale.set(1.3, 0.68, 1);
      innerWing.position.set(s * 0.25, 0.06, -0.08);
      targetGroup.add(innerWing);
    });
  } else {
    // BƯỚM ĐÊM NGÂN HÀ CỰC PHẨM: Cổ lông vũ trắng muốt + Cánh Luna Moth có đuôi lụa dài
    const fluffyCollar = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.055, 12, 24), secondaryMat);
    fluffyCollar.rotation.x = Math.PI / 2.2;
    fluffyCollar.position.set(0, 0.08, 0.06);
    petGroup.add(fluffyCollar);

    const bodyCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.16, 10, 14), bodyMat);
    bodyCore.rotation.x = Math.PI / 2.3;
    petGroup.add(bodyCore);

    const buildMothSide = (isLeft) => {
      const s = isLeft ? -1 : 1;
      const sideHolder = new THREE.Group();

      const mainWing = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), wingMat);
      mainWing.scale.set(1.2, 0.85, 1);
      mainWing.position.set(s * 0.25, 0.1, 0);
      sideHolder.add(mainWing);

      // Đuôi cánh lụa ngân hà kéo dài
      const ribbonTail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.36, 10), wingMat);
      ribbonTail.position.set(s * 0.2, -0.14, -0.22);
      ribbonTail.rotation.x = -0.85;
      ribbonTail.rotation.z = s * 0.28;
      sideHolder.add(ribbonTail);

      const moonSpot = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.075, 16), goldMat);
      moonSpot.position.set(s * 0.26, 0.1, 0.02);
      sideHolder.add(moonSpot);

      return sideHolder;
    };

    leftWingGroup.add(buildMothSide(true));
    rightWingGroup.add(buildMothSide(false));
  }

  // 4. Vòng Hào Quang Tinh Tú & 3 Tinh Thể Phép Thuật Bay Quanh Pet
  const orbitRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.016, 10, 36),
    new THREE.MeshBasicMaterial({ color: petConfig.glow, transparent: true, opacity: 0.7 })
  );
  orbitRing.rotation.x = Math.PI / 2;
  orbitRing.rotation.y = 0.25;
  petGroup.add(orbitRing);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const starCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), goldMat);
    starCrystal.position.set(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46);
    orbitRing.add(starCrystal);
  }

  const petLight = new THREE.PointLight(petConfig.glow, 1.5, 6);
  petGroup.add(petLight);

  return { petGroup, leftWing: leftWingGroup, rightWing: rightWingGroup, orbitRing };
}

function buildChibiCharacterMesh(zodiacConfig, petConfig, accessoryId = 'none', labelText = '') {
  const root = new THREE.Group();

  const primaryMat = new THREE.MeshStandardMaterial({
    color: zodiacConfig.primaryColor,
    roughness: 0.35,
    metalness: 0.15
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: zodiacConfig.secondaryColor,
    roughness: 0.4
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: zodiacConfig.accentColor,
    emissive: zodiacConfig.accentColor,
    emissiveIntensity: 0.35,
    roughness: 0.25
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: zodiacConfig.skinColor,
    roughness: 0.5
  });

  // 1. Thân Chibi
  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.95;
  root.add(bodyGroup);

  const torsoGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.78, 16);
  const torsoMesh = new THREE.Mesh(torsoGeo, primaryMat);
  torsoMesh.castShadow = true;
  bodyGroup.add(torsoMesh);

  const beltGeo = new THREE.TorusGeometry(0.39, 0.055, 10, 24);
  const beltMesh = new THREE.Mesh(beltGeo, accentMat);
  beltMesh.rotation.x = Math.PI / 2;
  beltMesh.position.y = -0.12;
  bodyGroup.add(beltMesh);

  const collarGeo = new THREE.TorusGeometry(0.31, 0.06, 10, 20);
  const collarMesh = new THREE.Mesh(collarGeo, secondaryMat);
  collarMesh.rotation.x = Math.PI / 2;
  collarMesh.position.y = 0.34;
  bodyGroup.add(collarMesh);

  // 2. Đầu Chibi To Đáng Yêu
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.88;
  bodyGroup.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.62, 24, 24);
  headGeo.scale(1.06, 0.96, 1.0);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  const hairCapGeo = new THREE.SphereGeometry(0.65, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const hairCap = new THREE.Mesh(hairCapGeo, primaryMat);
  hairCap.position.y = 0.04;
  hairCap.rotation.x = -0.12;
  headGroup.add(hairCap);

  // Mắt Chibi Long Lanh
  const eyeMat = new THREE.MeshBasicMaterial({ color: zodiacConfig.eyeColor });
  const pupilMat = new THREE.MeshBasicMaterial({ color: '#111827' });
  const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blushMat = new THREE.MeshBasicMaterial({ color: '#fb7185', transparent: true, opacity: 0.55 });

  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.23, -0.02, 0.56);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), eyeMat);
    iris.scale.set(0.9, 1.15, 0.35);
    eyeGroup.add(iris);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), pupilMat);
    pupil.scale.set(0.9, 1.1, 0.4);
    pupil.position.z = 0.025;
    eyeGroup.add(pupil);

    const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), shineMat);
    highlight.position.set(side * 0.025, 0.04, 0.048);
    eyeGroup.add(highlight);

    headGroup.add(eyeGroup);

    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), blushMat);
    blush.scale.set(1.3, 0.65, 0.3);
    blush.position.set(side * 0.36, -0.15, 0.51);
    headGroup.add(blush);
  });

  if (zodiacConfig.earType === 'pig') {
    const snout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: '#fb7185' })
    );
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, -0.1, 0.61);
    headGroup.add(snout);
  } else {
    const smileGeo = new THREE.TorusGeometry(0.065, 0.018, 8, 16, Math.PI);
    const smileMesh = new THREE.Mesh(smileGeo, new THREE.MeshBasicMaterial({ color: '#e11d48' }));
    smileMesh.rotation.x = Math.PI;
    smileMesh.position.set(0, -0.16, 0.59);
    headGroup.add(smileMesh);
  }

  // Tai & Sừng 12 Con Giáp
  const earsGroup = new THREE.Group();
  headGroup.add(earsGroup);

  if (zodiacConfig.earType === 'mouse') {
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), primaryMat);
      ear.rotation.x = Math.PI / 2;
      ear.rotation.z = s * -0.25;
      ear.position.set(s * 0.48, 0.52, 0);
      const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.09, 20), accentMat);
      ear.add(inner);
      earsGroup.add(ear);
    });
  } else if (zodiacConfig.earType === 'horns_buffalo') {
    const hornMat = new THREE.MeshStandardMaterial({ color: '#fde047', metalness: 0.6, roughness: 0.2 });
    [-1, 1].forEach((s) => {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.075, 10, 20, Math.PI * 0.75), hornMat);
      horn.position.set(s * 0.42, 0.48, 0);
      horn.rotation.z = s === 1 ? -0.4 : Math.PI + 0.4;
      earsGroup.add(horn);
    });
  } else if (['tiger', 'dog', 'monkey', 'pig'].includes(zodiacConfig.earType)) {
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), primaryMat);
      ear.scale.set(1, 1.1, 0.5);
      ear.position.set(s * 0.46, 0.48, 0);
      earsGroup.add(ear);
    });
  } else if (['cat', 'horse'].includes(zodiacConfig.earType)) {
    [-1, 1].forEach((s) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12), primaryMat);
      ear.position.set(s * 0.38, 0.62, 0);
      ear.rotation.z = s * -0.28;
      earsGroup.add(ear);
    });
  } else if (zodiacConfig.earType === 'dragon_horns') {
    [-1, 1].forEach((s) => {
      const branch1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.55, 10), accentMat);
      branch1.position.set(s * 0.3, 0.68, -0.05);
      branch1.rotation.z = s * -0.35;
      branch1.rotation.x = -0.25;
      earsGroup.add(branch1);

      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.38, 0.04),
        new THREE.MeshStandardMaterial({
          color: zodiacConfig.primaryColor,
          emissive: zodiacConfig.accentColor,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.85
        })
      );
      wing.position.set(s * 0.42, 0.18, -0.36);
      wing.rotation.y = s * -0.4;
      wing.rotation.z = s * 0.25;
      bodyGroup.add(wing);
    });
  } else if (zodiacConfig.earType === 'ram_horns') {
    [-1, 1].forEach((s) => {
      const ram = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.065, 10, 20, Math.PI * 1.35), secondaryMat);
      ram.position.set(s * 0.48, 0.34, 0.05);
      ram.rotation.y = s * 0.4;
      earsGroup.add(ram);
    });
  } else if (['rooster_crest', 'crown_fin'].includes(zodiacConfig.earType)) {
    for (let i = -1; i <= 1; i++) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 10), accentMat);
      crest.position.set(i * 0.12, 0.72, 0.08 - Math.abs(i) * 0.06);
      crest.rotation.z = i * -0.25;
      earsGroup.add(crest);
    }
  }

  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 24), accentMat);
  haloRing.rotation.x = Math.PI / 2;
  haloRing.position.y = 0.82;
  headGroup.add(haloRing);

  if (accessoryId === 'star_crown') {
    const crown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.22, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: '#fde047', metalness: 0.7, roughness: 0.2 })
    );
    crown.position.y = 0.78;
    headGroup.add(crown);
  } else if (accessoryId === 'cyber_wings') {
    [-1, 1].forEach((s) => {
      const cWing = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.42, 0.04),
        new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.8 })
      );
      cWing.position.set(s * 0.48, 0.22, -0.38);
      cWing.rotation.z = s * 0.3;
      bodyGroup.add(cWing);
    });
  } else if (accessoryId === 'lotus_cape') {
    const lotusRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.04, 12, 32),
      new THREE.MeshBasicMaterial({ color: '#f472b6' })
    );
    lotusRing.rotation.x = Math.PI / 2;
    lotusRing.position.y = -0.35;
    bodyGroup.add(lotusRing);
  }

  if (labelText) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(16, 20, 480, 88);
    ctx.strokeStyle = zodiacConfig.primaryColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(16, 20, 480, 88);
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText.slice(0, 22), 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(2.3, 0.58, 1);
    sprite.position.set(0, 1.32, 0);
    headGroup.add(sprite);
  }

  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, -0.18, -0.35);
  bodyGroup.add(tailGroup);

  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.55, 10), primaryMat);
  tailMesh.rotation.x = 0.85;
  tailMesh.position.set(0, 0.1, -0.18);
  tailGroup.add(tailMesh);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 8, 12), primaryMat);
  leftArm.position.set(-0.46, 0.12, 0);
  leftArm.castShadow = true;
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.32, 8, 12), primaryMat);
  rightArm.position.set(0.46, 0.12, 0);
  rightArm.castShadow = true;
  bodyGroup.add(rightArm);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 8, 12), secondaryMat);
  leftLeg.position.set(-0.18, 0.32, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 8, 12), secondaryMat);
  rightLeg.position.set(0.18, 0.32, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  const auraGeo = new THREE.RingGeometry(0.52, 0.66, 32);
  const auraMat = new THREE.MeshBasicMaterial({
    color: zodiacConfig.primaryColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65
  });
  const footAura = new THREE.Mesh(auraGeo, auraMat);
  footAura.rotation.x = -Math.PI / 2;
  footAura.position.y = 0.03;
  root.add(footAura);

  // --- PET ĐỒNG HÀNH CẤP CAO 3D (CHI TIẾT VÀ HOÀN MỸ HƠN) ---
  const { petGroup, leftWing, rightWing, orbitRing } = buildPremiumPetMesh(petConfig);
  petGroup.position.set(0.98, 1.85, -0.2);
  root.add(petGroup);

  root.userData = {
    bodyGroup,
    headGroup,
    earsGroup,
    tailGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    footAura,
    haloRing,
    petGroup,
    leftWing,
    rightWing,
    petOrbitRing: orbitRing
  };

  return root;
}

// ============================================================================
// COMPONENT STUDIO PREVIEW 3D NHÂN VẬT & PET TRỰC TIẾP TRÊN MÀN HÌNH ĐẦU
// ============================================================================
function CharacterStudioPreview({
  zodiacConfig,
  petConfig,
  accessoryId,
  playerName,
  previewAnim,
  focusTarget
}) {
  const previewMountRef = useRef(null);
  const characterMeshRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const animModeRef = useRef(previewAnim);
  animModeRef.current = previewAnim;
  const focusRef = useRef(focusTarget);
  focusRef.current = focusTarget;

  const dragRef = useRef({
    isDragging: false,
    lastX: 0,
    rotationY: 0.25,
    autoRotate: true
  });

  useEffect(() => {
    const container = previewMountRef.current;
    if (!container) return;

    const w = container.clientWidth || 380;
    const h = container.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 1.85, 4.5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Ánh sáng Studio cao cấp tôn dáng Nhân vật & Pet 3D
    const ambient = new THREE.AmbientLight('#ffffff', 0.9);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight('#fffbeb', 1.45);
    keyLight.position.set(4, 7, 5);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight('#38bdf8', 1.8, 12);
    rimLight.position.set(-3, 3, -3);
    scene.add(rimLight);

    // Bệ Đá Ngôi Sao ADIVA trong phòng chọn nhân vật
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const baseCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.75, 0.2, 36),
      new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.4, roughness: 0.3 })
    );
    baseCylinder.position.y = -0.1;
    baseCylinder.receiveShadow = true;
    stageGroup.add(baseCylinder);

    const glowRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.58, 0.035, 12, 48),
      new THREE.MeshBasicMaterial({ color: '#38bdf8' })
    );
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = 0.01;
    stageGroup.add(glowRing);

    let frameId;
    const animatePreview = (now) => {
      frameId = requestAnimationFrame(animatePreview);
      const t = now * 0.001;

      if (dragRef.current.autoRotate && !dragRef.current.isDragging) {
        dragRef.current.rotationY += 0.006;
      }

      const mesh = characterMeshRef.current;
      if (mesh) {
        mesh.rotation.y = dragRef.current.rotationY;
        const ud = mesh.userData;
        if (ud) {
          const mode = animModeRef.current;
          if (mode === 'walk') {
            ud.bodyGroup.position.y = 0.95 + Math.abs(Math.sin(t * 9)) * 0.09;
            ud.leftLeg.rotation.x = Math.sin(t * 9) * 0.65;
            ud.rightLeg.rotation.x = -Math.sin(t * 9) * 0.65;
            ud.leftArm.rotation.x = -Math.sin(t * 9) * 0.55;
            ud.rightArm.rotation.x = Math.sin(t * 9) * 0.55;
            ud.rightArm.rotation.z = 0;
          } else if (mode === 'jump') {
            mesh.position.y = Math.abs(Math.sin(t * 5.5)) * 0.45;
            ud.leftArm.rotation.z = -0.6;
            ud.rightArm.rotation.z = 0.6;
            ud.leftLeg.rotation.x = 0.25;
            ud.rightLeg.rotation.x = -0.25;
          } else if (mode === 'wave') {
            mesh.position.y = 0;
            ud.bodyGroup.position.y = 0.95 + Math.sin(t * 4) * 0.04;
            ud.rightArm.rotation.z = Math.PI * 0.75 + Math.sin(t * 12) * 0.32;
            ud.leftArm.rotation.z = 0;
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
          } else if (mode === 'dance') {
            mesh.position.y = Math.abs(Math.sin(t * 8)) * 0.15;
            ud.bodyGroup.rotation.z = Math.sin(t * 6) * 0.14;
            ud.leftArm.rotation.z = -Math.PI * 0.6 + Math.sin(t * 10) * 0.35;
            ud.rightArm.rotation.z = Math.PI * 0.6 + Math.cos(t * 10) * 0.35;
          } else {
            mesh.position.y = 0;
            ud.bodyGroup.rotation.z = 0;
            ud.bodyGroup.position.y = 0.95 + Math.sin(t * 2.5) * 0.035;
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
            ud.leftArm.rotation.x = 0;
            ud.rightArm.rotation.x = 0;
            ud.leftArm.rotation.z = 0;
            ud.rightArm.rotation.z = Math.sin(t * 2) * 0.06;
          }

          // Chuyển động Pet 3D Cấp Cao đập cánh & xoay vòng tinh tú
          ud.tailGroup.rotation.y = Math.sin(t * 5) * 0.35;
          ud.footAura.rotation.z += 0.015;
          if (ud.petGroup) {
            ud.petGroup.position.y = 1.85 + Math.sin(t * 3.8) * 0.14;
          }
          if (ud.leftWing && ud.rightWing) {
            ud.leftWing.rotation.y = Math.sin(t * 24) * 0.52;
            ud.rightWing.rotation.y = -Math.sin(t * 24) * 0.52;
          }
          if (ud.petOrbitRing) {
            ud.petOrbitRing.rotation.z += 0.025;
          }
        }
      }

      // Chuyển góc máy linh hoạt: Toàn thân / Cận cảnh Nhân vật / Cận cảnh Pet 3D
      if (cameraRef.current) {
        if (focusRef.current === 'pet') {
          cameraRef.current.position.lerp(new THREE.Vector3(0.85, 2.0, 2.35), 0.1);
          cameraRef.current.lookAt(0.85, 1.88, -0.15);
        } else if (focusRef.current === 'face') {
          cameraRef.current.position.lerp(new THREE.Vector3(0, 1.85, 2.65), 0.1);
          cameraRef.current.lookAt(0, 1.75, 0);
        } else {
          cameraRef.current.position.lerp(new THREE.Vector3(0.15, 1.7, 4.35), 0.1);
          cameraRef.current.lookAt(0.15, 1.35, 0);
        }
      }

      renderer.render(scene, camera);
    };

    frameId = requestAnimationFrame(animatePreview);

    const handleResize = () => {
      if (!previewMountRef.current || !cameraRef.current) return;
      const nw = previewMountRef.current.clientWidth || 380;
      const nh = previewMountRef.current.clientHeight || 360;
      cameraRef.current.aspect = nw / nh;
      cameraRef.current.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Cập nhật lại mô hình 3D ngay lập tức khi người chơi đổi Con Giáp, Pet hoặc Phụ Kiện
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (characterMeshRef.current) {
      scene.remove(characterMeshRef.current);
    }
    const mesh = buildChibiCharacterMesh(zodiacConfig, petConfig, accessoryId, playerName);
    scene.add(mesh);
    characterMeshRef.current = mesh;
  }, [zodiacConfig, petConfig, accessoryId, playerName]);

  return (
    <div className="relative w-full h-72 sm:h-80 rounded-2xl overflow-hidden border-2 border-sky-400/40 bg-slate-950 shadow-inner">
      <div
        ref={previewMountRef}
        onMouseDown={(e) => {
          dragRef.current.isDragging = true;
          dragRef.current.autoRotate = false;
          dragRef.current.lastX = e.clientX;
        }}
        onMouseMove={(e) => {
          if (!dragRef.current.isDragging) return;
          const dx = e.clientX - dragRef.current.lastX;
          dragRef.current.lastX = e.clientX;
          dragRef.current.rotationY += dx * 0.012;
        }}
        onMouseUp={() => {
          dragRef.current.isDragging = false;
        }}
        onMouseLeave={() => {
          dragRef.current.isDragging = false;
        }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
      <div className="pointer-events-none absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
        <span className="px-2.5 py-1 rounded-full bg-slate-900/85 border border-sky-400/40 text-[10px] font-extrabold text-sky-300">
          ✨ Kéo chuột xoay 360°
        </span>
        <button
          type="button"
          onClick={() => {
            dragRef.current.autoRotate = !dragRef.current.autoRotate;
          }}
          className="pointer-events-auto px-2.5 py-1 rounded-full bg-slate-900/85 hover:bg-slate-800 border border-white/20 text-[10px] font-bold text-amber-300"
        >
          🔄 Tự Xoay 360°
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENT CHÍNH: ADIVA CHIBI WORLD - HOÀN CHỈNH 7 GIAI ĐOẠN
// ============================================================================
export default function App() {
  // --- State Quản lý Người Chơi, Nhân Vật, Phụ Kiện & Pet ---
  const [user, setUser] = useState(null);
  const [localPlayerId] = useState(() => 'chibi_' + Math.random().toString(36).substring(2, 9));
  const [selectedZodiacIndex, setSelectedZodiacIndex] = useState(3); // Mặc định: Mão - Mèo Pastel
  const [selectedPetIndex, setSelectedPetIndex] = useState(0); // Bướm Tiên Ánh Sao
  const [petLevel, setPetLevel] = useState(1);
  const [selectedAccessory, setSelectedAccessory] = useState('none');
  const [unlockedAccessories, setUnlockedAccessories] = useState(['none', 'angel_halo']);
  const [playerName, setPlayerName] = useState('Nhà Thám Hiểm Chibi');
  const [coins, setCoins] = useState(1500);
  const [exp, setExp] = useState(120);
  const playerLevel = Math.floor(exp / 100) + 1;

  // --- State Thời Gian Ngày/Đêm & Đồ Họa ---
  const [timeOfDay, setTimeOfDay] = useState(9.5);
  const [autoTimeCycle, setAutoTimeCycle] = useState(false);
  const [skyGazingMode, setSkyGazingMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fps, setFps] = useState(60);

  // --- State Tùy Chỉnh Màu Sắc Thiên Nhiên Thời Gian Thực ---
  const [natureColors, setNatureColors] = useState(DEFAULT_NATURE_COLORS);

  // --- State Multiplayer 4 Người & Khung Chat ---
  const [roomCode, setRoomCode] = useState('ADIVA1');
  const [inputRoomCode, setInputRoomCode] = useState('ADIVA1');
  const [remotePlayers, setRemotePlayers] = useState({});
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'welcome_1',
      sender: 'Hệ Thống ADIVA',
      zodiac: 'Thìn',
      text: 'Chào mừng 4 người bạn đến với ADIVA CHIBI WORLD! Hãy ghé Khu Cắm Trại nướng BBQ, Bắn pháo hoa và Trồng cây nhé!',
      time: '09:30'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  // --- State Cắm Trại BBQ & Quầy Bán Pháo Hoa ---
  const [bbqCookingState, setBbqCookingState] = useState(null);
  const [inventory, setInventory] = useState({
    fw_rainbow: 3,
    fw_heart: 2,
    fw_dragon: 1,
    fw_grand: 1,
    fertilizer: 5
  });

  // --- State Khu Vườn 3D 12 Ô Đất & Nhà Riêng 3D ---
  const [selectedSeedId, setSelectedSeedId] = useState('rose');
  const [visitingFriendId, setVisitingFriendId] = useState(null);
  const [allowGardenSteal, setAllowGardenSteal] = useState(true);
  const [gardenPlots, setGardenPlots] = useState(() =>
    Array.from({ length: 12 }, (_, idx) => ({
      id: `plot_${idx}`,
      cropId: idx < 4 ? GARDEN_CROPS[idx].id : null,
      stage: idx === 0 ? 4 : idx < 4 ? idx + 1 : 0,
      watered: idx < 4
    }))
  );
  const [houseConfig, setHouseConfig] = useState({
    level: 1,
    wallColor: '#fef3c7',
    roofColor: '#f43f5e',
    decorLanterns: true,
    decorBonsai: true
  });

  // --- State Khu Trò Chơi Dân Gian & Hành Trình Văn Hóa 4 Người ---
  const [activeFolkGame, setActiveFolkGame] = useState('o_an_quan');
  const [oAnQuanBoard, setOAnQuanBoard] = useState([10, 5, 5, 5, 5, 5, 10, 5, 5, 5, 5, 5]);
  const [oAnQuanScore, setOAnQuanScore] = useState({ player: 0, friend: 0 });
  const [oAnQuanTurn, setOAnQuanTurn] = useState('player');
  const [caroBoard, setCaroBoard] = useState(() => Array(64).fill(null));
  const [caroTurn, setCaroTurn] = useState('X');
  const [caroWinner, setCaroWinner] = useState(null);
  const [rpsResult, setRpsResult] = useState(null);
  const [proverbIndex, setProverbIndex] = useState(0);
  const [memoryCards, setMemoryCards] = useState(() => {
    const symbols = ['🪷', '🐉', '🏮', '🎋', '🥁', '🪭'];
    return [...symbols, ...symbols]
      .map((symbol, i) => ({ id: i, symbol, flipped: false, matched: false }));
  });
  const [flippedIndices, setFlippedIndices] = useState([]);
  const [culturalQuizIndex, setCulturalQuizIndex] = useState(0);
  const [groupCulturalProgress, setGroupCulturalProgress] = useState(30);
  const [collectedRelics, setCollectedRelics] = useState(['Trống Đồng Đông Sơn']);

  // --- State Giao Diện, Tương Tác & Điều Khiển ---
  const [showWelcomeHero, setShowWelcomeHero] = useState(true);
  const [previewAnimMode, setPreviewAnimMode] = useState('idle');
  const [previewFocusTarget, setPreviewFocusTarget] = useState('full');
  const [activePanel, setActivePanel] = useState(null);
  const [playerCoords, setPlayerCoords] = useState({ x: 0, z: 9 });
  const [playerStatus, setPlayerStatus] = useState('Đang khám phá Công viên ADIVA');
  const [activeEmote, setActiveEmote] = useState(null);
  const [isSitting, setIsSitting] = useState(false);
  const [isOnTowerTop, setIsOnTowerTop] = useState(false);
  const [nearbyZonePrompt, setNearbyZonePrompt] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // --- Refs cho Three.js Scene & Đồng Bộ ---
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const playerMeshRef = useRef(null);
  const remotePlayerMeshesRef = useRef({});
  const broadcastChannelRef = useRef(null);
  const isOnTowerTopRef = useRef(false);
  isOnTowerTopRef.current = isOnTowerTop;

  const playerStateRef = useRef({
    x: 0,
    y: 0,
    z: 9.5,
    vx: 0,
    vy: 0,
    vz: 0,
    rotationY: Math.PI,
    isGrounded: true,
    isRunning: false,
    isSitting: false,
    isLying: false,
    emoteTimer: 0,
    emoteId: null
  });

  const keysRef = useRef({});
  const cameraControlRef = useRef({
    theta: 0,
    phi: 0.42,
    distance: 10.5,
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0
  });

  const worldObjectsRef = useRef({
    globeGroup: null,
    globeSphere: null,
    orbitBanner: null,
    outerRing: null,
    sakuraMeshes: [],
    pineMeshes: [],
    flowerMeshes: [],
    lanternMeshes: [],
    lanternLights: [],
    koiFishList: [],
    birds: [],
    petalsSystem: null,
    firefliesSystem: null,
    starsSystem: null,
    galaxySystem: null,
    constellationLines: null,
    sunMesh: null,
    moonMesh: null,
    dirLight: null,
    ambientLight: null,
    hemiLight: null,
    waterMesh: null,
    cloudsGroup: null,
    fireworksList: [],
    benches: [],
    gardenPlotMeshes: [],
    houseGroup: null,
    campfireFlame: null
  });

  const multiplayerProfileRef = useRef(null);
  multiplayerProfileRef.current = {
    name: playerName,
    zodiacIndex: selectedZodiacIndex,
    petIndex: selectedPetIndex,
    accessory: selectedAccessory,
    gardenPlots,
    allowGardenSteal
  };

  const timeRef = useRef(timeOfDay);
  timeRef.current = timeOfDay;

  const skyGazingRef = useRef(skyGazingMode);
  skyGazingRef.current = skyGazingMode;

  const showToast = useCallback((msg) => {
    setToastMessage(String(msg));
    setTimeout(() => {
      setToastMessage((prev) => (prev === String(msg) ? null : prev));
    }, 3400);
  }, []);

  // --- Cây trồng trong Khu Vườn 3D tự động lớn lên theo thời gian ---
  useEffect(() => {
    const growthInterval = setInterval(() => {
      setGardenPlots((prev) =>
        prev.map((plot) => {
          if (plot.cropId && plot.stage > 0 && plot.stage < 4 && plot.watered) {
            return { ...plot, stage: plot.stage + 1 };
          }
          return plot;
        })
      );
    }, 9000);
    return () => clearInterval(growthInterval);
  }, []);

  // ============================================================================
  // HÀM BẮN PHÁO HOA 3D TRÊN BẦU TRỜI & PHẢN CHIẾU MẶT HỒ
  // ============================================================================
  const spawnFirework3D = useCallback((fwConfig = FIREWORK_ITEMS[0], customOrigin = null) => {
    if (!sceneRef.current) return;
    soundFX.playFirework();

    const palette = fwConfig?.colors || [0xf472b6, 0x38bdf8, 0xfacc15, 0x4ade80];
    const bursts = fwConfig?.bursts || 4;
    const baseOriginX = customOrigin?.x ?? playerStateRef.current.x;
    const baseOriginZ = customOrigin?.z ?? playerStateRef.current.z;

    for (let burst = 0; burst < bursts; burst++) {
      setTimeout(() => {
        if (!sceneRef.current) return;
        const count = 85;
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const originX = baseOriginX + (Math.random() - 0.5) * 24;
        const originY = 17 + Math.random() * 10;
        const originZ = baseOriginZ - 8 + (Math.random() - 0.5) * 20;

        for (let i = 0; i < count; i++) {
          positions[i * 3] = originX;
          positions[i * 3 + 1] = originY;
          positions[i * 3 + 2] = originZ;

          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const speed = 4 + Math.random() * 7;
          velocities.push({
            vx: Math.sin(phi) * Math.cos(theta) * speed,
            vy: Math.sin(phi) * Math.sin(theta) * speed,
            vz: Math.cos(phi) * speed
          });
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const colorHex = palette[burst % palette.length];
        const mat = new THREE.PointsMaterial({
          color: colorHex,
          size: 0.68,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending
        });

        const points = new THREE.Points(geo, mat);
        const flashLight = new THREE.PointLight(colorHex, 3.5, 45);
        flashLight.position.set(originX, originY, originZ);
        sceneRef.current.add(points);
        sceneRef.current.add(flashLight);

        worldObjectsRef.current.fireworksList.push({
          points,
          flashLight,
          velocities,
          age: 0,
          maxAge: 2.2
        });
      }, burst * 320);
    }
  }, []);

  // ============================================================================
  // ĐỒNG BỘ MULTIPLAYER 4 NGƯỜI THỜI GIAN THỰC (BROADCAST CHANNEL + FIREBASE)
  // ============================================================================
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(`adiva_room_${roomCode}`);
    broadcastChannelRef.current = channel;

    channel.onmessage = (event) => {
      const { type, senderId, payload } = event.data || {};
      if (!senderId || senderId === localPlayerId) return;

      if (type === 'PLAYER_SYNC') {
        setRemotePlayers((prev) => {
          const existingCount = Object.keys(prev).length;
          if (!prev[senderId] && existingCount >= 3) return prev; // Giới hạn tối đa 4 người trong phòng
          return {
            ...prev,
            [senderId]: { ...payload, id: senderId, lastSeen: Date.now() }
          };
        });
      } else if (type === 'CHAT_MSG') {
        setChatMessages((prev) => [...prev.slice(-39), payload]);
      } else if (type === 'CLEAR_CHAT') {
        setChatMessages([]);
        showToast(`🧹 ${payload?.clearedBy || 'Một người bạn'} vừa xóa lịch sử trò chuyện.`);
      } else if (type === 'DELETE_CHAT_MSG') {
        setChatMessages((prev) => prev.filter((m) => m.id !== payload?.messageId));
      } else if (type === 'FIREWORK_EVENT') {
        spawnFirework3D(payload.fwConfig, payload.origin);
        showToast(`🎆 ${payload.playerName} vừa bắn pháo hoa lên bầu trời!`);
      } else if (type === 'GARDEN_HELP') {
        showToast(`💧 ${payload.helperName} vừa tưới cây giúp khu vườn của bạn!`);
      } else if (type === 'GARDEN_STEAL') {
        showToast(`🦊 ${payload.thiefName} vừa hái trộm 1 ${payload.cropName} trong vườn của bạn!`);
      }
    };

    const syncInterval = setInterval(() => {
      channel.postMessage({
        type: 'PLAYER_SYNC',
        senderId: localPlayerId,
        payload: {
          name: playerName,
          zodiacIndex: selectedZodiacIndex,
          petIndex: selectedPetIndex,
          accessory: selectedAccessory,
          x: playerStateRef.current.x,
          y: playerStateRef.current.y,
          z: playerStateRef.current.z,
          rotationY: playerStateRef.current.rotationY,
          gardenPlots,
          allowGardenSteal
        }
      });
    }, 200);

    return () => {
      clearInterval(syncInterval);
      channel.close();
    };
  }, [
    roomCode,
    localPlayerId,
    playerName,
    selectedZodiacIndex,
    selectedPetIndex,
    selectedAccessory,
    gardenPlots,
    allowGardenSteal,
    spawnFirework3D,
    showToast
  ]);

  // --- Kết nối Firebase Auth & Đồng bộ Phòng Cloud (Nếu có cấu hình Firebase) ---
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.warn('Auth fallback:', e);
      }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (! user || !db || !roomCode) return;
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'multiplayer_rooms', roomCode);
    const unsub = onSnapshot(
      roomDocRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (Array.isArray(data.messages)) {
          setChatMessages(data.messages);
        }
      },
      (err) => console.warn('Room snapshot warning:', err)
    );
    return () => unsub();
  }, [user, roomCode]);

  // Presence đa thiết bị qua Firestore: mỗi người chơi có một document riêng.
  // Roster trong document phòng được cập nhật bằng transaction để khóa ở 4 người.
  useEffect(() => {
    if (!user || !db || !roomCode) return;
    let cancelled = false;
    let heartbeat = null;
    let rosterHeartbeat = null;
    const cloudPlayerId = user.uid;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'multiplayer_rooms', roomCode);
    const playersRef = collection(roomRef, 'players');
    const myPlayerRef = doc(playersRef, cloudPlayerId);

    const joinAndSync = async () => {
      try {
        await runTransaction(db, async (transaction) => {
          const roomSnap = await transaction.get(roomRef);
          const data = roomSnap.exists() ? roomSnap.data() : {};
          const now = Date.now();
          const members = Object.fromEntries(
            Object.entries(data.members || {}).filter(([id, seenAt]) => id === cloudPlayerId || now - Number(seenAt) < 15000)
          );
          if (!members[cloudPlayerId] && Object.keys(members).length >= 4) {
            throw new Error('ROOM_FULL');
          }
          members[cloudPlayerId] = now;
          transaction.set(roomRef, { members }, { merge: true });
        });
        if (cancelled) return;

        const publishPresence = () => setDoc(myPlayerRef, {
          ...multiplayerProfileRef.current,
          x: playerStateRef.current.x,
          y: playerStateRef.current.y,
          z: playerStateRef.current.z,
          rotationY: playerStateRef.current.rotationY,
          updatedAt: Date.now()
        }, { merge: true }).catch((err) => console.warn('Không thể đồng bộ vị trí:', err));

        publishPresence();
        heartbeat = setInterval(publishPresence, 500);
        rosterHeartbeat = setInterval(() => {
          runTransaction(db, async (transaction) => {
            const snap = await transaction.get(roomRef);
            if (!snap.exists()) return;
            const members = { ...(snap.data().members || {}) };
            members[cloudPlayerId] = Date.now();
            transaction.set(roomRef, { members }, { merge: true });
          }).catch(() => {});
        }, 5000);

        const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
          const now = Date.now();
          const next = {};
          snapshot.forEach((playerDoc) => {
            if (playerDoc.id === cloudPlayerId) return;
            const player = playerDoc.data();
            if (now - Number(player.updatedAt || 0) > 12000) return;
            next[playerDoc.id] = { ...player, id: playerDoc.id, lastSeen: player.updatedAt };
          });
          setRemotePlayers(next);
        }, (err) => console.warn('Lỗi theo dõi người chơi:', err));
        cleanupPlayers = unsubscribePlayers;
      } catch (err) {
        if (err?.message === 'ROOM_FULL') {
          showToast('⚠️ Phòng đã đủ 4/4 người. Hãy tạo phòng khác nhé!');
        } else {
          console.warn('Không thể tham gia phòng trực tuyến:', err);
          showToast('⚠️ Chưa kết nối được máy chủ. Kiểm tra cấu hình Firebase và Rules.');
        }
      }
    };

    let cleanupPlayers = () => {};
    joinAndSync();
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (rosterHeartbeat) clearInterval(rosterHeartbeat);
      cleanupPlayers();
      deleteDoc(myPlayerRef).catch(() => {});
      runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) return;
        const members = { ...(snap.data().members || {}) };
        delete members[cloudPlayerId];
        transaction.set(roomRef, { members }, { merge: true });
      }).catch(() => {});
    };
  }, [user, roomCode, showToast]);

  // ============================================================================
  // KHỞI TẠO THẾ GIỚI MỞ 3D CÔNG VIÊN ADIVA (THREE.JS SCENE & VÒNG LẶP VẬT LÝ)
  // ============================================================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Hàm tính độ cao mặt đất & nhịp cầu gỗ cong bắc qua suối
    const getTerrainHeight = (x, z) => {
      // Nhịp cầu gỗ tại X: [-2.8, 2.8], Z: [12, 24]
      if (Math.abs(x) <= 2.85 && z >= 12 && z <= 24) {
        const norm = (z - 18) / 6;
        return Math.max(0, Math.cos(norm * (Math.PI / 2)) * 1.45);
      }
      // Bệ đá Quảng trường Trung tâm ADIVA
      const distCenter = Math.hypot(x, z);
      if (distCenter < 5.2) return 0.35;
      if (distCenter < 11.8) return 0.1;
      return 0;
    };

    // --- 1. KHỞI TẠO SCENE, CAMERA & RENDERER ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#7dd3fc');
    scene.fog = new THREE.FogExp2('#bae6fd', 0.0055);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 400);
    camera.position.set(0, 6.5, 19);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- 2. HỆ THỐNG ÁNH SÁNG MÔI TRƯỜNG, MẶT TRỜI, MẶT TRĂNG & BẦU TRỜI SAO ---
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.65);
    scene.add(ambientLight);
    worldObjectsRef.current.ambientLight = ambientLight;

    const hemiLight = new THREE.HemisphereLight('#e0f2fe', '#86efac', 0.55);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);
    worldObjectsRef.current.hemiLight = hemiLight;

    const dirLight = new THREE.DirectionalLight('#fffbeb', 1.3);
    dirLight.position.set(35, 55, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 160;
    const d = 55;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);
    worldObjectsRef.current.dirLight = dirLight;

    // Mặt Trời rực rỡ
    const sunGroup = new THREE.Group();
    const sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#fde047' })
    );
    const sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(7.8, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.35 })
    );
    sunGroup.add(sunSphere);
    sunGroup.add(sunHalo);
    scene.add(sunGroup);
    worldObjectsRef.current.sunMesh = sunGroup;

    // Mặt Trăng tròn phát sáng ban đêm
    const moonGroup = new THREE.Group();
    const moonSphere = new THREE.Mesh(
      new THREE.SphereGeometry(4.6, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#f8fafc' })
    );
    const moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(6.8, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0.3 })
    );
    moonGroup.add(moonSphere);
    moonGroup.add(moonHalo);
    scene.add(moonGroup);
    worldObjectsRef.current.moonMesh = moonGroup;

    // Hệ thống 1,500 Ngôi Sao Lấp Lánh trên bầu trời đêm
    const starCount = 1500;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 145 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.48; // Nửa vòm trời trên
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi) + 8;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 1.15,
      transparent: true,
      opacity: 0
    });
    const starsSystem = new THREE.Points(starGeo, starMat);
    scene.add(starsSystem);
    worldObjectsRef.current.starsSystem = starsSystem;

    // Dải Ngân Hà (Milky Way Ribbon)
    const galaxyCount = 900;
    const galaxyPos = new Float32Array(galaxyCount * 3);
    const galaxyColors = new Float32Array(galaxyCount * 3);
    const c1 = new THREE.Color('#38bdf8');
    const c2 = new THREE.Color('#f472b6');
    const c3 = new THREE.Color('#a78bfa');

    for (let i = 0; i < galaxyCount; i++) {
      const t = (i / galaxyCount - 0.5) * Math.PI * 0.92;
      const spread = (Math.random() - 0.5) * 26;
      const r = 138;
      galaxyPos[i * 3] = Math.sin(t) * r + spread;
      galaxyPos[i * 3 + 1] = Math.cos(t) * r * 0.85 + 25 + (Math.random() - 0.5) * 10;
      galaxyPos[i * 3 + 2] = (Math.random() - 0.5) * 42 - 20;

      const chosen = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
      galaxyColors[i * 3] = chosen.r;
      galaxyColors[i * 3 + 1] = chosen.g;
      galaxyColors[i * 3 + 2] = chosen.b;
    }
    const galaxyGeo = new THREE.BufferGeometry();
    galaxyGeo.setAttribute('position', new THREE.BufferAttribute(galaxyPos, 3));
    galaxyGeo.setAttribute('color', new THREE.BufferAttribute(galaxyColors, 3));
    const galaxyMat = new THREE.PointsMaterial({
      size: 1.8,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });
    const galaxySystem = new THREE.Points(galaxyGeo, galaxyMat);
    scene.add(galaxySystem);
    worldObjectsRef.current.galaxySystem = galaxySystem;

    // Các Chòm Sao Nối Vạch Sáng (Constellations)
    const constellationGroup = new THREE.Group();
    const constPoints = [
      // Chòm sao Bắc Đẩu
      [
        [-45, 95, -55],
        [-32, 102, -52],
        [-20, 99, -48],
        [-8, 96, -45],
        [-5, 84, -42],
        [10, 86, -40],
        [12, 98, -42],
        [-8, 96, -45]
      ],
      // Chòm sao Thiên Nga / Phượng Hoàng
      [
        [35, 105, -30],
        [48, 96, -25],
        [62, 88, -20],
        [48, 96, -25],
        [56, 108, -12],
        [48, 96, -25],
        [38, 84, -38]
      ]
    ];
    const lineMat = new THREE.LineBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0
    });
    constPoints.forEach((pts) => {
      const vecs = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const lGeo = new THREE.BufferGeometry().setFromPoints(vecs);
      const line = new THREE.Line(lGeo, lineMat);
      constellationGroup.add(line);
    });
    scene.add(constellationGroup);
    worldObjectsRef.current.constellationLines = lineMat;

    // Mây Trắng Bay Chậm
    const cloudsGroup = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.9,
      transparent: true,
      opacity: 0.88
    });
    for (let i = 0; i < 14; i++) {
      const singleCloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.8 + Math.random() * 1.8, 12, 12), cloudMat);
        puff.position.set(j * 2.4 - 3.2, Math.random() * 0.8, (Math.random() - 0.5) * 1.8);
        puff.scale.y = 0.58;
        singleCloud.add(puff);
      }
      singleCloud.position.set((Math.random() - 0.5) * 140, 32 + Math.random() * 12, (Math.random() - 0.5) * 140);
      cloudsGroup.add(singleCloud);
    }
    scene.add(cloudsGroup);
    worldObjectsRef.current.cloudsGroup = cloudsGroup;

    // --- 3. ĐỊA HÌNH THUNG LŨNG CỎ XANH, DÒNG SUỐI & HỒ CÁ KOI ---
    const groundGeo = new THREE.CircleGeometry(135, 64);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#86efac',
      roughness: 0.85
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Dòng suối trong xanh chảy qua công viên & Hồ Cá Koi
    const waterGeo = new THREE.PlaneGeometry(120, 11.5, 32, 8);
    const waterMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_NATURE_COLORS.waterTint,
      roughness: 0.12,
      metalness: 0.65,
      transparent: true,
      opacity: 0.86
    });
    const streamMesh = new THREE.Mesh(waterGeo, waterMat);
    streamMesh.rotation.x = -Math.PI / 2;
    streamMesh.position.set(0, 0.06, 18);
    scene.add(streamMesh);

    // Mở rộng Hồ Cá Koi ở phía Đông dòng suối
    const pondGeo = new THREE.CircleGeometry(13.5, 36);
    const pondMesh = new THREE.Mesh(pondGeo, waterMat);
    pondMesh.rotation.x = -Math.PI / 2;
    pondMesh.position.set(20, 0.07, 18);
    scene.add(pondMesh);
    worldObjectsRef.current.waterMesh = waterMat;

    // Đá cuội ven suối
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.75 });
    for (let x = -48; x <= 48; x += 3.2) {
      if (Math.abs(x) < 3.6) continue; // Chừa lối lên cầu gỗ
      [-5.8, 5.8].forEach((offsetZ) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65 + Math.random() * 0.45, 1), stoneMat);
        rock.position.set(x + (Math.random() - 0.5), 0.15, 18 + offsetZ + (Math.random() - 0.5));
        rock.scale.y = 0.55;
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
      });
    }

    // --- 4. ĐÀN CÁ KOI NHIỀU MÀU SẮC BƠI LỘI DƯỚI NƯỚC ---
    const koiColors = ['#f97316', '#ef4444', '#facc15', '#ffffff', '#fb7185'];
    const koiList = [];
    for (let i = 0; i < 18; i++) {
      const koiGroup = new THREE.Group();
      const kColor = koiColors[i % koiColors.length];
      const fishBody = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.72, 10),
        new THREE.MeshStandardMaterial({ color: kColor, roughness: 0.3 })
      );
      fishBody.rotation.x = Math.PI / 2;
      koiGroup.add(fishBody);

      const fishTail = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.32, 6),
        new THREE.MeshStandardMaterial({ color: '#ffffff' })
      );
      fishTail.rotation.x = -Math.PI / 2;
      fishTail.position.z = -0.42;
      koiGroup.add(fishTail);

      scene.add(koiGroup);
      koiList.push({
        group: koiGroup,
        tail: fishTail,
        centerX: i < 10 ? 20 + (Math.random() - 0.5) * 10 : (Math.random() - 0.5) * 35,
        centerZ: 18 + (Math.random() - 0.5) * 4,
        radiusX: 2.2 + Math.random() * 4.5,
        radiusZ: 1.4 + Math.random() * 2.2,
        speed: 0.6 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2
      });
    }
    worldObjectsRef.current.koiFishList = koiList;

    // --- 5. CẦU GỖ CỔ TÍCH BẮC NGANG QUA SUỐI ---
    const bridgeGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: '#b45309', roughness: 0.65 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45 });

    const plankCount = 22;
    for (let i = 0; i <= plankCount; i++) {
      const t = i / plankCount; // 0 -> 1
      const zPos = 12 + t * 12; // 12 -> 24
      const norm = (zPos - 18) / 6;
      const yPos = Math.cos(norm * (Math.PI / 2)) * 1.45;

      const plank = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 0.52), woodMat);
      plank.position.set(0, yPos, zPos);
      plank.castShadow = true;
      plank.receiveShadow = true;
      bridgeGroup.add(plank);

      if (i % 3 === 0) {
        [-2.65, 2.65].forEach((sideX) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.15, 10), railMat);
          post.position.set(sideX, yPos + 0.55, zPos);
          post.castShadow = true;
          bridgeGroup.add(post);
        });
      }
    }
    scene.add(bridgeGroup);

    // --- 6. TRUNG TÂM CÔNG VIÊN ADIVA: QUẢ ĐỊA CẦU 3D & LOGO ADIVA PHÁT SÁNG ---
    const plazaGroup = new THREE.Group();
    scene.add(plazaGroup);

    // Nền lát đá Quảng trường cho 4 người chơi tập trung
    const plazaFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(11.5, 12.2, 0.14, 48),
      new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.45 })
    );
    plazaFloor.position.y = 0.04;
    plazaFloor.receiveShadow = true;
    plazaGroup.add(plazaFloor);

    // Vòng cổ ngữ phát sáng trên mặt quảng trường
    const runeRing = new THREE.Mesh(
      new THREE.RingGeometry(8.5, 9.1, 48),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', side: THREE.DoubleSide })
    );
    runeRing.rotation.x = -Math.PI / 2;
    runeRing.position.y = 0.12;
    plazaGroup.add(runeRing);

    // 4 Bệ Tập Trung cho 4 Người Chơi (P1, P2, P3, P4)
    const padColors = ['#38bdf8', '#f472b6', '#4ade80', '#facc15'];
    [
      [0, 7.2],
      [7.2, 0],
      [0, -7.2],
      [-7.2, 0]
    ].forEach(([px, pz], idx) => {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.3, 0.18, 24),
        new THREE.MeshStandardMaterial({
          color: padColors[idx],
          emissive: padColors[idx],
          emissiveIntensity: 0.4
        })
      );
      pad.position.set(px, 0.12, pz);
      plazaGroup.add(pad);
    });

    // Bệ Đá Trung Tâm Đa Tầng
    const pedestalBase = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 5.2, 0.45, 32),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.3 })
    );
    pedestalBase.position.y = 0.22;
    pedestalBase.receiveShadow = true;
    plazaGroup.add(pedestalBase);

    const pedestalTier2 = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 3.4, 0.75, 32),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.3 })
    );
    pedestalTier2.position.y = 0.75;
    plazaGroup.add(pedestalTier2);

    const pedestalGlowRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.12, 16, 48),
      new THREE.MeshBasicMaterial({ color: '#fde047' })
    );
    pedestalGlowRing.rotation.x = Math.PI / 2;
    pedestalGlowRing.position.y = 1.12;
    plazaGroup.add(pedestalGlowRing);

    // QUẢ ĐỊA CẦU 3D LỚN TỰ XOAY & DẢI CHỮ "ADIVA CHIBI WORLD"
    const globeGroup = new THREE.Group();
    globeGroup.position.set(0, 4.4, 0);
    plazaGroup.add(globeGroup);

    const globeTex = createGlobeTexture();
    const globeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.25, 36, 36),
      new THREE.MeshStandardMaterial({
        map: globeTex,
        roughness: 0.25,
        metalness: 0.15,
        emissive: '#0284c7',
        emissiveIntensity: 0.22
      })
    );
    globeSphere.castShadow = true;
    globeGroup.add(globeSphere);

    // Vòng quỹ đạo vàng xoay quanh Quả Địa Cầu
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.05, 0.07, 14, 64),
      new THREE.MeshStandardMaterial({
        color: '#fde047',
        emissive: '#f59e0b',
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.2
      })
    );
    outerRing.rotation.x = Math.PI / 3;
    globeGroup.add(outerRing);

    // Dải băng 3D mang dòng chữ nổi bật "✦ ADIVA CHIBI WORLD ✦"
    const bannerTex = createAdivaBannerTexture();
    const bannerGeo = new THREE.CylinderGeometry(2.75, 2.75, 0.9, 48, 1, true);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    const orbitBanner = new THREE.Mesh(bannerGeo, bannerMat);
    orbitBanner.rotation.z = 0.12;
    globeGroup.add(orbitBanner);

    const globeLight = new THREE.PointLight('#38bdf8', 2.2, 24);
    globeGroup.add(globeLight);

    worldObjectsRef.current.globeGroup = globeGroup;
    worldObjectsRef.current.globeSphere = globeSphere;
    worldObjectsRef.current.orbitBanner = orbitBanner;
    worldObjectsRef.current.outerRing = outerRing;

    // --- 7. GHẾ ĐÁ XUNG QUANH ĐỂ NGỒI THƯ GIÃN ---
    const benchPositions = [
      { x: -8.5, z: 5.5, rot: Math.PI * 0.35, label: 'Ghế Đá Quảng Trường Tây' },
      { x: 8.5, z: 5.5, rot: -Math.PI * 0.35, label: 'Ghế Đá Quảng Trường Đông' },
      { x: -8.5, z: -5.5, rot: Math.PI * 0.65, label: 'Ghế Đá Ngắm Địa Cầu' },
      { x: 11.5, z: 13.0, rot: 0, label: 'Ghế Đá Ven Hồ Cá Koi' }
    ];
    const benchesList = [];
    benchPositions.forEach((b) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(b.x, 0, b.z);
      bGroup.rotation.y = b.rot;

      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.16, 0.85),
        new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.5 })
      );
      seat.position.y = 0.52;
      seat.castShadow = true;
      bGroup.add(seat);

      const backRest = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.65, 0.14),
        new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.5 })
      );
      backRest.position.set(0, 0.88, -0.36);
      backRest.castShadow = true;
      bGroup.add(backRest);

      [-0.95, 0.95].forEach((lx) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.75), stoneMat);
        leg.position.set(lx, 0.25, 0);
        bGroup.add(leg);
      });

      scene.add(bGroup);
      benchesList.push({ ...b, y: 0.55 });
    });
    worldObjectsRef.current.benches = benchesList;

    // --- 8. CÂY HOA ANH ĐÀO, CÂY XANH, BỤI HOA & ĐÈN CÔNG VIÊN (CHO PHÉP ĐỔI MÀU) ---
    const sakuraMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_NATURE_COLORS.sakuraColor,
      roughness: 0.6
    });
    const foliageMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_NATURE_COLORS.treeFoliageColor,
      roughness: 0.65
    });
    const flowerMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_NATURE_COLORS.flowerBedColor,
      emissive: DEFAULT_NATURE_COLORS.flowerBedColor,
      emissiveIntensity: 0.2
    });
    const lanternMat = new THREE.MeshStandardMaterial({
      color: DEFAULT_NATURE_COLORS.lanternGlowColor,
      emissive: DEFAULT_NATURE_COLORS.lanternGlowColor,
      emissiveIntensity: 0.9
    });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.85 });

    const sakuraTrees = [];
    const pineTrees = [];

    // Đặt 22 cây Hoa Anh Đào cổ tích quanh công viên
    const sakuraCoords = [
      [-15, -10], [-22, -16], [-28, -12], [-18, -24], [-12, -20],
      [15, -12], [23, -18], [19, -25], [-16, 10], [-24, 8],
      [16, 8], [28, 10], [-14, 28], [14, 28], [-26, 26], [28, 27]
    ];

    sakuraCoords.forEach(([tx, tz], idx) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tx, getTerrainHeight(tx, tz), tz);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, 3.2, 10), trunkMat);
      trunk.position.y = 1.6;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const crownGroup = new THREE.Group();
      crownGroup.position.y = 3.5;
      [
        [0, 0.4, 0, 2.2],
        [-1.2, 0, 0.6, 1.6],
        [1.2, 0.1, -0.5, 1.65],
        [0, 0.1, -1.2, 1.5]
      ].forEach(([cx, cy, cz, cr]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(cr, 14, 14), sakuraMat);
        puff.position.set(cx, cy, cz);
        puff.scale.y = 0.78;
        puff.castShadow = true;
        crownGroup.add(puff);
      });
      treeGroup.add(crownGroup);
      scene.add(treeGroup);
      sakuraTrees.push({ group: crownGroup, phase: idx * 0.7 });
    });

    // Đặt 24 Cây Thông & Cây Xanh nhiều chủng loại
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const radius = 34 + (i % 3) * 8;
      const px = Math.cos(angle) * radius;
      const pz = Math.sin(angle) * radius;
      if (Math.abs(pz - 18) < 7) continue; // Tránh lòng suối

      const pGroup = new THREE.Group();
      pGroup.position.set(px, getTerrainHeight(px, pz), pz);

      const pTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 2.6, 8), trunkMat);
      pTrunk.position.y = 1.3;
      pGroup.add(pTrunk);

      for (let tier = 0; tier < 3; tier++) {
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(2.2 - tier * 0.45, 2.5, 12),
          foliageMat
        );
        cone.position.y = 2.6 + tier * 1.45;
        cone.castShadow = true;
        pGroup.add(cone);
      }
      scene.add(pGroup);
      pineTrees.push({ group: pGroup, phase: i * 0.5 });
    }

    // Bụi hoa trang trí khắp công viên
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 13 + Math.random() * 24;
      const fx = Math.cos(angle) * r;
      const fz = Math.sin(angle) * r;
      if (Math.abs(fz - 18) < 6.5) continue;

      const fBush = new THREE.Mesh(new THREE.SphereGeometry(0.42 + Math.random() * 0.25, 10, 10), flowerMat);
      fBush.position.set(fx, getTerrainHeight(fx, fz) + 0.2, fz);
      fBush.scale.y = 0.65;
      scene.add(fBush);
    }

    // Đèn Lồng Pha Lê Công Viên phát sáng ban đêm
    const lanternLights = [];
    const lanternPositions = [
      [-6, 11], [6, 11], [-3.4, 12], [3.4, 12], [-3.4, 24], [3.4, 24],
      [-11, 0], [11, 0], [0, -11]
    ];
    lanternPositions.forEach(([lx, lz]) => {
      const lGroup = new THREE.Group();
      lGroup.position.set(lx, getTerrainHeight(lx, lz), lz);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.12, 2.8, 10),
        new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.6 })
      );
      pole.position.y = 1.4;
      lGroup.add(pole);

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 14), lanternMat);
      orb.position.y = 2.95;
      lGroup.add(orb);

      const pLight = new THREE.PointLight(DEFAULT_NATURE_COLORS.lanternGlowColor, 1.2, 14);
      pLight.position.y = 2.95;
      lGroup.add(pLight);
      lanternLights.push(pLight);

      scene.add(lGroup);
    });

    worldObjectsRef.current.sakuraMeshes = [sakuraMat];
    worldObjectsRef.current.pineMeshes = [foliageMat];
    worldObjectsRef.current.flowerMeshes = [flowerMat];
    worldObjectsRef.current.lanternMeshes = [lanternMat];
    worldObjectsRef.current.lanternLights = lanternLights;
    worldObjectsRef.current.sakuraTrees = sakuraTrees;

    // --- 8B. KHU CẮM TRẠI VEN SUỐI (LỀU TRẠI, LỬA TRẠI BBQ & QUẦY BÁN PHÁO HOA) ---
    const campGroup = new THREE.Group();
    campGroup.position.set(-22, 0, 25);
    scene.add(campGroup);

    // 2 Lều cắm trại màu sắc ấm áp
    [
      [-3.5, -2.5, 0.4, '#f97316'],
      [3.5, -2.2, -0.4, '#38bdf8']
    ].forEach(([tx, tz, rot, tColor]) => {
      const tent = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 2.5, 4),
        new THREE.MeshStandardMaterial({ color: tColor, roughness: 0.6 })
      );
      tent.position.set(tx, 1.25, tz);
      tent.rotation.y = rot;
      tent.castShadow = true;
      campGroup.add(tent);
    });

    // Đống lửa trại trung tâm + Hiệu ứng ngọn lửa phát sáng
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 8), trunkMat);
      log.position.set(0, 0.18, 0);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 6) * Math.PI;
      campGroup.add(log);
    }
    const flameMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 1.35, 10),
      new THREE.MeshBasicMaterial({ color: '#f97316' })
    );
    flameMesh.position.set(0, 0.72, 0);
    campGroup.add(flameMesh);
    const campLight = new THREE.PointLight('#fb923c', 2.4, 18);
    campLight.position.set(0, 1.4, 0);
    campGroup.add(campLight);
    worldObjectsRef.current.campfireFlame = flameMesh;

    // 4 Ghế gỗ ngồi quanh lửa trại cho 4 người bạn
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const seatLog = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.5), trunkMat);
      seatLog.position.set(Math.cos(a) * 2.5, 0.2, Math.sin(a) * 2.5);
      seatLog.rotation.y = -a + Math.PI / 2;
      campGroup.add(seatLog);
    }

    // Quầy Bán Pháo Hoa Lễ Hội bên cạnh khu cắm trại
    const fireworkBooth = new THREE.Group();
    fireworkBooth.position.set(-5.2, 0, 2.2);
    const boothCounter = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.1, 1.2),
      new THREE.MeshStandardMaterial({ color: '#e11d48', roughness: 0.5 })
    );
    boothCounter.position.y = 0.55;
    fireworkBooth.add(boothCounter);
    const boothRoof = new THREE.Mesh(
      new THREE.ConeGeometry(2.1, 1.2, 4),
      new THREE.MeshStandardMaterial({ color: '#facc15', roughness: 0.4 })
    );
    boothRoof.position.y = 2.6;
    boothRoof.rotation.y = Math.PI / 4;
    fireworkBooth.add(boothRoof);
    campGroup.add(fireworkBooth);

    // --- 8C. KHU VƯỜN 3D 12 Ô ĐẤT TRỒNG CÂY & CĂN NHÀ RIÊNG 3D ---
    const gardenGroup = new THREE.Group();
    gardenGroup.position.set(20, 0, 25);
    scene.add(gardenGroup);

    const plotMeshes = [];
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const px = (col - 1.5) * 2.2;
      const pz = (row - 1) * 2.2;

      const soilMat = new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9 });
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.18, 1.75), soilMat);
      soil.position.set(px, 0.09, pz);
      soil.receiveShadow = true;
      gardenGroup.add(soil);

      const plantHolder = new THREE.Group();
      plantHolder.position.set(px, 0.18, pz);
      gardenGroup.add(plantHolder);

      plotMeshes.push({ soil, plantHolder });
    }
    worldObjectsRef.current.gardenPlotMeshes = plotMeshes;

    const houseGroup = new THREE.Group();
    houseGroup.position.set(31, 0, 25);
    scene.add(houseGroup);
    worldObjectsRef.current.houseGroup = houseGroup;

    // --- 8D. CHÙA LIÊN HOA VIỆT NAM, NHÀ THỜ CỔ TÍCH, THÁP NGẮM CẢNH & KHU DÂN GIAN ---
    // 1. Chùa Liên Hoa (X: -28, Z: -20)
    const pagodaGroup = new THREE.Group();
    pagodaGroup.position.set(-28, 0, -20);
    const pagodaBase = new THREE.Mesh(
      new THREE.BoxGeometry(7, 3.2, 5.5),
      new THREE.MeshStandardMaterial({ color: '#fef08a', roughness: 0.6 })
    );
    pagodaBase.position.y = 1.6;
    pagodaGroup.add(pagodaBase);
    const pagodaRoof = new THREE.Mesh(
      new THREE.ConeGeometry(5.8, 2.4, 4),
      new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45 })
    );
    pagodaRoof.position.y = 4.3;
    pagodaRoof.rotation.y = Math.PI / 4;
    pagodaGroup.add(pagodaRoof);
    scene.add(pagodaGroup);

    // 2. Nhà Thờ Cổ Tích Châu Âu (X: 28, Z: -20)
    const churchGroup = new THREE.Group();
    churchGroup.position.set(28, 0, -20);
    const churchHall = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 4.5, 7.5),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 })
    );
    churchHall.position.y = 2.25;
    churchGroup.add(churchHall);
    const bellTower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.6, 8.5, 8),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0' })
    );
    bellTower.position.set(0, 4.25, 3.2);
    churchGroup.add(bellTower);
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 3.5, 8),
      new THREE.MeshStandardMaterial({ color: '#6366f1' })
    );
    spire.position.set(0, 10.2, 3.2);
    churchGroup.add(spire);
    scene.add(churchGroup);

    // 3. Tháp Ngắm Cảnh Toàn Công Viên (X: 0, Z: -32)
    const towerGroup = new THREE.Group();
    towerGroup.position.set(0, 0, -32);
    const towerPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.8, 13.5, 16),
      new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.4 })
    );
    towerPillar.position.y = 6.75;
    towerGroup.add(towerPillar);
    const towerDeck = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.2, 0.5, 24),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.3 })
    );
    towerDeck.position.y = 13.5;
    towerGroup.add(towerDeck);
    scene.add(towerGroup);

    // 4. Khu Trò Chơi Dân Gian Cộng Đồng (X: -24, Z: 2)
    const folkGroup = new THREE.Group();
    folkGroup.position.set(-24, 0, 2);
    const folkStage = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.5, 0.25, 24),
      new THREE.MeshStandardMaterial({ color: '#fde68a', roughness: 0.6 })
    );
    folkStage.position.y = 0.12;
    folkGroup.add(folkStage);
    scene.add(folkGroup);

    // --- 9. NÚI CAO ĐA LỚP Ở PHÍA XA BAO QUANH CÔNG VIÊN ---
    const mountainColors = ['#64748b', '#475569', '#334155'];
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const dist = 82 + (i % 3) * 16;
      const mHeight = 28 + (i % 4) * 12;
      const mRadius = 18 + (i % 3) * 7;

      const mGroup = new THREE.Group();
      mGroup.position.set(Math.cos(angle) * dist, -1, Math.sin(angle) * dist);

      const mCone = new THREE.Mesh(
        new THREE.ConeGeometry(mRadius, mHeight, 7),
        new THREE.MeshStandardMaterial({
          color: mountainColors[i % mountainColors.length],
          roughness: 0.85,
          flatShading: true
        })
      );
      mCone.position.y = mHeight / 2;
      mGroup.add(mCone);

      // Chóp tuyết trắng trên đỉnh núi cao
      const snowCap = new THREE.Mesh(
        new THREE.ConeGeometry(mRadius * 0.36, mHeight * 0.36, 7),
        new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.5, flatShading: true })
      );
      snowCap.position.y = mHeight * 0.82;
      mGroup.add(snowCap);

      scene.add(mGroup);
    }

    // --- 10. HỆ THỐNG HẠT: HOA ĐÀO RƠI LIÊN TỤC THEO GIÓ & ĐOM ĐÓM BAN ĐÊM ---
    const petalCount = 360;
    const petalPos = new Float32Array(petalCount * 3);
    for (let i = 0; i < petalCount; i++) {
      petalPos[i * 3] = (Math.random() - 0.5) * 75;
      petalPos[i * 3 + 1] = Math.random() * 18;
      petalPos[i * 3 + 2] = (Math.random() - 0.5) * 75;
    }
    const petalGeo = new THREE.BufferGeometry();
    petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
    const petalMat = new THREE.PointsMaterial({
      color: '#ffb7c5',
      size: 0.34,
      transparent: true,
      opacity: 0.9
    });
    const petalsSystem = new THREE.Points(petalGeo, petalMat);
    scene.add(petalsSystem);
    worldObjectsRef.current.petalsSystem = petalsSystem;

    // Đom đóm phát sáng bay lên từ thảm cỏ lúc hoàng hôn & ban đêm
    const fireflyCount = 180;
    const fireflyPos = new Float32Array(fireflyCount * 3);
    for (let i = 0; i < fireflyCount; i++) {
      fireflyPos[i * 3] = (Math.random() - 0.5) * 68;
      fireflyPos[i * 3 + 1] = 0.5 + Math.random() * 5.5;
      fireflyPos[i * 3 + 2] = (Math.random() - 0.5) * 68;
    }
    const fireflyGeo = new THREE.BufferGeometry();
    fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
    const fireflyMat = new THREE.PointsMaterial({
      color: '#fde047',
      size: 0.42,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending
    });
    const firefliesSystem = new THREE.Points(fireflyGeo, fireflyMat);
    scene.add(firefliesSystem);
    worldObjectsRef.current.firefliesSystem = firefliesSystem;

    // --- 11. CHIM BAY TRÊN BẦU TRỜI ---
    const birdsList = [];
    for (let i = 0; i < 8; i++) {
      const birdGroup = new THREE.Group();
      const bWingMat = new THREE.MeshBasicMaterial({ color: '#f8fafc', side: THREE.DoubleSide });
      const wL = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.2), bWingMat);
      wL.position.x = -0.22;
      const wR = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.2), bWingMat);
      wR.position.x = 0.22;
      birdGroup.add(wL);
      birdGroup.add(wR);
      scene.add(birdGroup);
      birdsList.push({
        group: birdGroup,
        wL,
        wR,
        angle: (i / 8) * Math.PI * 2,
        radius: 26 + (i % 3) * 8,
        height: 16 + (i % 4) * 2.5,
        speed: 0.35 + (i % 3) * 0.08
      });
    }
    worldObjectsRef.current.birds = birdsList;

    // --- 12. VÒNG LẶP ANIMATION & VẬT LÝ MƯỢT MÀ ---
    let animationFrameId;
    let lastTime = performance.now();
    let frameCounter = 0;
    let fpsAccumulator = 0;

    const animate = (now) => {
      animationFrameId = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      frameCounter++;
      fpsAccumulator += dt;
      if (fpsAccumulator >= 0.5) {
        setFps(Math.min(60, Math.round(frameCounter / fpsAccumulator)));
        frameCounter = 0;
        fpsAccumulator = 0;
      }

      const elapsed = now * 0.001;
      const wo = worldObjectsRef.current;

      // A. Xoay Quả Địa Cầu 3D ADIVA & Vòng Chữ Nổi
      if (wo.globeSphere) {
        wo.globeSphere.rotation.y += dt * 0.45;
      }
      if (wo.orbitBanner) {
        wo.orbitBanner.rotation.y -= dt * 0.65;
      }
      if (wo.outerRing) {
        wo.outerRing.rotation.z += dt * 0.5;
      }
      if (wo.globeGroup) {
        wo.globeGroup.position.y = 4.4 + Math.sin(elapsed * 1.8) * 0.22;
      }
      if (wo.campfireFlame) {
        wo.campfireFlame.scale.y = 1 + Math.sin(elapsed * 14) * 0.22;
        wo.campfireFlame.rotation.y += dt * 3;
      }

      // B. Hiệu ứng gió đung đưa tán cây Hoa Anh Đào & Cánh hoa rơi
      if (wo.sakuraTrees) {
        wo.sakuraTrees.forEach((st) => {
          st.group.rotation.z = Math.sin(elapsed * 1.4 + st.phase) * 0.045;
          st.group.rotation.x = Math.cos(elapsed * 1.1 + st.phase) * 0.03;
        });
      }

      if (wo.petalsSystem) {
        const posArr = wo.petalsSystem.geometry.attributes.position.array;
        for (let i = 0; i < petalCount; i++) {
          posArr[i * 3] += Math.sin(elapsed + i) * 0.025 + dt * 0.6; // Gió thổi nhẹ
          posArr[i * 3 + 1] -= dt * 1.35; // Rơi xuống
          posArr[i * 3 + 2] += Math.cos(elapsed * 0.8 + i) * 0.02;

          if (posArr[i * 3 + 1] < 0) {
            posArr[i * 3 + 1] = 16 + Math.random() * 4;
            posArr[i * 3] = (Math.random() - 0.5) * 75;
          }
        }
        wo.petalsSystem.geometry.attributes.position.needsUpdate = true;
      }

      // C. Cá Koi bơi lội uốn lượn dưới dòng suối
      if (wo.koiFishList) {
        wo.koiFishList.forEach((koi) => {
          koi.phase += dt * koi.speed;
          const nextX = koi.centerX + Math.cos(koi.phase) * koi.radiusX;
          const nextZ = koi.centerZ + Math.sin(koi.phase * 1.5) * koi.radiusZ;
          const dx = nextX - koi.group.position.x;
          const dz = nextZ - koi.group.position.z;
          koi.group.position.set(nextX, -0.08, nextZ);
          koi.group.rotation.y = Math.atan2(dx, dz);
          koi.tail.rotation.y = Math.sin(elapsed * 12 + koi.phase) * 0.45;
        });
      }

      // D. Chim bay & Mây trôi
      if (wo.birds) {
        wo.birds.forEach((b) => {
          b.angle += dt * b.speed;
          const bx = Math.cos(b.angle) * b.radius;
          const bz = Math.sin(b.angle) * b.radius;
          b.group.position.set(bx, b.height + Math.sin(elapsed * 2 + b.angle) * 0.5, bz);
          b.group.rotation.y = -b.angle;
          const flap = Math.sin(elapsed * 10 + b.angle) * 0.55;
          b.wL.rotation.z = flap;
          b.wR.rotation.z = -flap;
        });
      }

      if (wo.cloudsGroup) {
        wo.cloudsGroup.rotation.y += dt * 0.012;
      }

      // E. Cập nhật Chu kỳ Thời Gian: Ngày - Hoàng Hôn - Đêm
      const curHour = timeRef.current;
      const sunAngle = ((curHour - 6) / 24) * Math.PI * 2;
      const sunY = Math.sin(sunAngle) * 75;
      const sunX = Math.cos(sunAngle) * 75;

      if (wo.sunMesh && wo.moonMesh && wo.dirLight) {
        wo.sunMesh.position.set(sunX, sunY, -35);
        wo.moonMesh.position.set(-sunX, -sunY, -35);

        const isNight = curHour < 5.5 || curHour >= 19.2;
        const isSunset = (curHour >= 16.5 && curHour < 19.2) || (curHour >= 5.2 && curHour < 6.5);

        let targetSky = new THREE.Color('#7dd3fc');
        let targetFog = new THREE.Color('#bae6fd');
        let dirIntensity = 1.3;
        let starOpacity = 0;
        let fireflyOpacity = 0;

        if (isNight) {
          targetSky.set('#090d1e');
          targetFog.set('#0f172a');
          dirIntensity = 0.28;
          starOpacity = 0.95;
          fireflyOpacity = 0.9;
        } else if (isSunset) {
          targetSky.set('#fb7185');
          targetFog.set('#fda4af');
          dirIntensity = 0.85;
          starOpacity = 0.35;
          fireflyOpacity = 0.65;
        }

        scene.background.lerp(targetSky, 0.06);
        scene.fog.color.lerp(targetFog, 0.06);
        wo.dirLight.intensity = THREE.MathUtils.lerp(wo.dirLight.intensity, dirIntensity, 0.06);
        wo.dirLight.position.set(
          sunY > 0 ? sunX : -sunX,
          Math.max(18, Math.abs(sunY)),
          25
        );

        if (wo.starsSystem) wo.starsSystem.material.opacity = starOpacity;
        if (wo.galaxySystem) wo.galaxySystem.material.opacity = starOpacity * 0.85;
        if (wo.constellationLines) wo.constellationLines.opacity = starOpacity * 0.65;

        if (wo.firefliesSystem) {
          wo.firefliesSystem.material.opacity = fireflyOpacity;
          const ffPos = wo.firefliesSystem.geometry.attributes.position.array;
          for (let i = 0; i < fireflyCount; i++) {
            ffPos[i * 3 + 1] += Math.sin(elapsed * 2.5 + i) * 0.012;
          }
          wo.firefliesSystem.geometry.attributes.position.needsUpdate = true;
        }
      }

      // F. Cập nhật Pháo Hoa nổ trên bầu trời
      for (let i = wo.fireworksList.length - 1; i >= 0; i--) {
        const fw = wo.fireworksList[i];
        fw.age += dt;
        const posAttr = fw.points.geometry.attributes.position;
        for (let j = 0; j < fw.velocities.length; j++) {
          const v = fw.velocities[j];
          v.vy -= dt * 3.8; // Trọng lực nhẹ
          posAttr.array[j * 3] += v.vx * dt;
          posAttr.array[j * 3 + 1] += v.vy * dt;
          posAttr.array[j * 3 + 2] += v.vz * dt;
        }
        posAttr.needsUpdate = true;
        fw.points.material.opacity = Math.max(0, 1 - fw.age / fw.maxAge);
        fw.flashLight.intensity = Math.max(0, 3.5 * (1 - fw.age / fw.maxAge));

        if (fw.age >= fw.maxAge) {
          scene.remove(fw.points);
          scene.remove(fw.flashLight);
          wo.fireworksList.splice(i, 1);
        }
      }

      // G. ĐIỀU KHIỂN NHÂN VẬT CHIBI & CAMERA 360 ĐỘ
      const pState = playerStateRef.current;
      const pMesh = playerMeshRef.current;
      const keys = keysRef.current;
      const camCtrl = cameraControlRef.current;

      if (pMesh) {
        let moveForward = 0;
        let moveRight = 0;
        if (keys['KeyW'] || keys['ArrowUp']) moveForward += 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveForward -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveRight -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) moveRight += 1;

        const isMoving = moveForward !== 0 || moveRight !== 0;
        const isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];

        if (isMoving && pState.isSitting) {
          pState.isSitting = false;
          setIsSitting(false);
        }

        if (isMoving && !pState.isSitting) {
          const camYaw = camCtrl.theta;
          const forwardX = -Math.sin(camYaw);
          const forwardZ = -Math.cos(camYaw);
          const rightX = Math.cos(camYaw);
          const rightZ = -Math.sin(camYaw);

          const dirX = forwardX * moveForward + rightX * moveRight;
          const dirZ = forwardZ * moveForward + rightZ * moveRight;
          const len = Math.hypot(dirX, dirZ) || 1;

          const baseSpeed = isSprinting ? 9.5 : 5.6;
          pState.vx = (dirX / len) * baseSpeed;
          pState.vz = (dirZ / len) * baseSpeed;

          pState.x = THREE.MathUtils.clamp(pState.x + pState.vx * dt, -52, 52);
          pState.z = THREE.MathUtils.clamp(pState.z + pState.vz * dt, -52, 52);

          // Không đi xuyên qua tâm Quả Địa Cầu
          const distToCore = Math.hypot(pState.x, pState.z);
          if (distToCore < 3.1) {
            pState.x = (pState.x / distToCore) * 3.1;
            pState.z = (pState.z / distToCore) * 3.1;
          }

          const targetRot = Math.atan2(dirX, dirZ);
          pState.rotationY = targetRot;
        } else {
          pState.vx = 0;
          pState.vz = 0;
        }

        // Vật lý nhảy & độ cao địa hình / cầu gỗ
        const groundY = isOnTowerTopRef.current ? 13.5 : getTerrainHeight(pState.x, pState.z);
        if (!pState.isGrounded) {
          pState.vy -= 22 * dt;
          pState.y += pState.vy * dt;
          if (pState.y <= groundY) {
            pState.y = groundY;
            pState.vy = 0;
            pState.isGrounded = true;
          }
        } else {
          pState.y = THREE.MathUtils.lerp(pState.y, groundY, 0.25);
        }

        pMesh.position.set(pState.x, pState.y, pState.z);
        pMesh.rotation.y = pState.rotationY;

        // Hoạt ảnh Xương/Khớp Nhân vật Chibi & Pet bay theo
        const ud = pMesh.userData;
        if (ud) {
          const walkFreq = isSprinting ? 14 : 9;
          if (pState.isSitting) {
            ud.bodyGroup.position.y = 0.62;
            ud.leftLeg.rotation.x = -Math.PI / 2.2;
            ud.rightLeg.rotation.x = -Math.PI / 2.2;
            ud.leftArm.rotation.x = -0.3;
            ud.rightArm.rotation.x = -0.3;
          } else if (isMoving) {
            ud.bodyGroup.position.y = 0.95 + Math.abs(Math.sin(elapsed * walkFreq)) * 0.09;
            ud.leftLeg.rotation.x = Math.sin(elapsed * walkFreq) * 0.65;
            ud.rightLeg.rotation.x = -Math.sin(elapsed * walkFreq) * 0.65;
            ud.leftArm.rotation.x = -Math.sin(elapsed * walkFreq) * 0.55;
            ud.rightArm.rotation.x = Math.sin(elapsed * walkFreq) * 0.55;
          } else if (pState.emoteTimer > 0) {
            pState.emoteTimer -= dt;
            ud.rightArm.rotation.z = Math.PI * 0.75 + Math.sin(elapsed * 14) * 0.35;
            ud.bodyGroup.position.y = 0.95 + Math.abs(Math.sin(elapsed * 8)) * 0.16;
          } else {
            // Đứng nghỉ thở nhẹ
            ud.bodyGroup.position.y = 0.95 + Math.sin(elapsed * 2.5) * 0.03;
            ud.leftLeg.rotation.x = 0;
            ud.rightLeg.rotation.x = 0;
            ud.leftArm.rotation.x = 0;
            ud.rightArm.rotation.x = 0;
            ud.rightArm.rotation.z = Math.sin(elapsed * 2) * 0.06;
          }

          // Đuôi linh vật vẫy nhẹ & Pet đập cánh bay theo
          ud.tailGroup.rotation.y = Math.sin(elapsed * 5) * 0.35;
          ud.footAura.rotation.z += dt * 0.8;
          if (ud.petGroup) {
            ud.petGroup.position.y = 1.85 + Math.sin(elapsed * 3.8) * 0.18;
          }
          if (ud.leftWing && ud.rightWing) {
            ud.leftWing.rotation.y = Math.sin(elapsed * 24) * 0.55;
            ud.rightWing.rotation.y = -Math.sin(elapsed * 24) * 0.55;
          }
          if (ud.petOrbitRing) {
            ud.petOrbitRing.rotation.z += dt * 1.5;
          }
        }

        // Kiểm tra khu vực tương tác gần người chơi & cập nhật tọa độ HUD
        if (frameCounter % 8 === 0) {
          setPlayerCoords({ x: Math.round(pState.x), z: Math.round(pState.z) });

          const distCamp = Math.hypot(pState.x - -22, pState.z - 25);
          const distGarden = Math.hypot(pState.x - 24, pState.z - 25);
          const distPagoda = Math.hypot(pState.x - -28, pState.z - -20);
          const distChurch = Math.hypot(pState.x - 28, pState.z - -20);
          const distTower = Math.hypot(pState.x - 0, pState.z - -32);
          const distFolk = Math.hypot(pState.x - -24, pState.z - 2);
          const distPlaza = Math.hypot(pState.x, pState.z);

          if (distCamp < 8.5) {
            setNearbyZonePrompt({
              id: 'camping',
              title: '🔥 Khu Cắm Trại & Quầy Pháo Hoa',
              actionLabel: 'Mở Lửa Trại BBQ & Mua Pháo Hoa (Phím E)',
              panel: 'camping_firework'
            });
          } else if (distGarden < 11.5) {
            setNearbyZonePrompt({
              id: 'garden_house',
              title: '🌱 Khu Vườn 3D & Nhà Riêng Của Bạn',
              actionLabel: 'Trồng Cây, Thu Hoạch & Trang Trí Nhà (Phím E)',
              panel: 'garden_house'
            });
          } else if (distPagoda < 8.5) {
            setNearbyZonePrompt({
              id: 'pagoda',
              title: '🪷 Chùa Liên Hoa Việt Nam',
              actionLabel: 'Thắp Hương Cầu An & Ngồi Thiền (Phím E)',
              panel: 'pagoda_modal'
            });
          } else if (distChurch < 8.5) {
            setNearbyZonePrompt({
              id: 'church',
              title: '🔔 Nhà Thờ Cổ Tích Châu Âu',
              actionLabel: 'Cầu Nguyện & Rung Chuông Tháp (Phím E)',
              panel: 'church_modal'
            });
          } else if (distTower < 7.5) {
            setNearbyZonePrompt({
              id: 'tower',
              title: '🗼 Tháp Ngắm Cảnh Toàn Công Viên',
              actionLabel: isOnTowerTopRef.current ? 'Đi Thang Máy Xuống Đất (Phím E)' : 'Đi Thang Máy Lên Đỉnh Tháp (Phím E)',
              panel: 'tower_elevator'
            });
          } else if (distFolk < 7.5) {
            setNearbyZonePrompt({
              id: 'folk',
              title: '🏮 Khu Trò Chơi Dân Gian & Văn Hóa Việt',
              actionLabel: 'Chơi Ô Ăn Quan, Caro & Giải Đố (Phím E)',
              panel: 'folk_cultural'
            });
          } else if (distPlaza < 9.5) {
            setNearbyZonePrompt({
              id: 'plaza',
              title: '🌍 Trung Tâm Quả Địa Cầu ADIVA',
              actionLabel: 'Bắn Pháo Hoa Sự Kiện Chung (Phím F)',
              panel: 'plaza_firework'
            });
          } else {
            setNearbyZonePrompt(null);
          }
        }
      }

      // Cập nhật Camera 360 độ & Chế độ Ngắm Bầu Trời Sao
      if (camera && pState) {
        const targetLookY = pState.y + (skyGazingRef.current ? 2.4 : 1.7);
        const effPhi = skyGazingRef.current ? -0.45 : camCtrl.phi;
        const effDist = skyGazingRef.current ? 5.2 : camCtrl.distance;

        const camX = pState.x + effDist * Math.sin(camCtrl.theta) * Math.cos(effPhi);
        const camY = Math.max(0.75, targetLookY + effDist * Math.sin(effPhi));
        const camZ = pState.z + effDist * Math.cos(camCtrl.theta) * Math.cos(effPhi);

        camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.16);
        if (skyGazingRef.current) {
          camera.lookAt(
            pState.x - Math.sin(camCtrl.theta) * 14,
            pState.y + 18,
            pState.z - Math.cos(camCtrl.theta) * 14
          );
        } else {
          camera.lookAt(pState.x, targetLookY, pState.z);
        }
      }

      renderer.render(scene, camera);
    };

    animationFrameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth || window.innerWidth;
      const h = mountRef.current.clientHeight || window.innerHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // ============================================================================
  // ĐỒNG BỘ MÔ HÌNH 3D NHÂN VẬT CHÍNH, PHỤ KIỆN & PET KHI THAY ĐỔI
  // ============================================================================
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (playerMeshRef.current) {
      scene.remove(playerMeshRef.current);
    }

    const zodiacCfg = ZODIAC_CHARACTERS[selectedZodiacIndex];
    const petCfg = PET_COMPANIONS[selectedPetIndex];
    const newMesh = buildChibiCharacterMesh(zodiacCfg, petCfg, selectedAccessory, `${playerName} (Bạn)`);
    newMesh.position.set(playerStateRef.current.x, playerStateRef.current.y, playerStateRef.current.z);
    newMesh.rotation.y = playerStateRef.current.rotationY;
    scene.add(newMesh);
    playerMeshRef.current = newMesh;
  }, [selectedZodiacIndex, selectedPetIndex, selectedAccessory, playerName]);

  // ============================================================================
  // ĐỒNG BỘ MÔ HÌNH 3D CỦA 3 NGƯỜI BẠN MULTIPLAYER TRONG THẾ GIỚI 3D
  // ============================================================================
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentRemoteMeshes = remotePlayerMeshesRef.current;
    const activeIds = Object.keys(remotePlayers);

    // Xóa người chơi đã rời phòng
    Object.keys(currentRemoteMeshes).forEach((id) => {
      if (!remotePlayers[id]) {
        scene.remove(currentRemoteMeshes[id].mesh);
        delete currentRemoteMeshes[id];
      }
    });

    // Thêm hoặc cập nhật vị trí 3D của bạn bè trong phòng
    activeIds.forEach((id) => {
      const rp = remotePlayers[id];
      const zIdx = rp.zodiacIndex ?? 0;
      const pIdx = rp.petIndex ?? 0;
      const acc = rp.accessory || 'none';
      const sig = `${rp.name}_${zIdx}_${pIdx}_${acc}`;

      if (!currentRemoteMeshes[id] || currentRemoteMeshes[id].signature !== sig) {
        if (currentRemoteMeshes[id]) {
          scene.remove(currentRemoteMeshes[id].mesh);
        }
        const zCfg = ZODIAC_CHARACTERS[zIdx] || ZODIAC_CHARACTERS[0];
        const pCfg = PET_COMPANIONS[pIdx] || PET_COMPANIONS[0];
        const mesh = buildChibiCharacterMesh(zCfg, pCfg, acc, rp.name || 'Bạn Chibi');
        scene.add(mesh);
        currentRemoteMeshes[id] = { mesh, signature: sig };
      }

      const targetMesh = currentRemoteMeshes[id].mesh;
      targetMesh.position.lerp(new THREE.Vector3(rp.x || 0, rp.y || 0, rp.z || 0), 0.35);
      targetMesh.rotation.y = rp.rotationY || 0;
    });
  }, [remotePlayers]);

  // ============================================================================
  // ĐỒNG BỘ MÔ HÌNH 3D 12 Ô ĐẤT KHU VƯỜN THEO GIAI ĐOẠN PHÁT TRIỂN CÂY
  // ============================================================================
  useEffect(() => {
    const plotMeshes = worldObjectsRef.current.gardenPlotMeshes;
    if (!plotMeshes || plotMeshes.length === 0) return;

    const activePlots = visitingFriendId && remotePlayers[visitingFriendId]?.gardenPlots
      ? remotePlayers[visitingFriendId].gardenPlots
      : gardenPlots;

    activePlots.forEach((plot, idx) => {
      const item = plotMeshes[idx];
      if (!item) return;

      // Đổi màu đất khi đã tưới nước ẩm
      item.soil.material.color.set(plot.watered ? '#3e2723' : '#6d4c41');

      // Xóa mô hình cây cũ trên ô đất
      while (item.plantHolder.children.length > 0) {
        item.plantHolder.remove(item.plantHolder.children[0]);
      }

      if (!plot.cropId || plot.stage === 0) return;
      const cropInfo = GARDEN_CROPS.find((c) => c.id === plot.cropId) || GARDEN_CROPS[0];

      if (plot.stage === 1) {
        // Giai đoạn 1: Gieo hạt
        const seedMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 10, 10),
          new THREE.MeshStandardMaterial({ color: '#fde047' })
        );
        seedMesh.position.y = 0.1;
        item.plantHolder.add(seedMesh);
      } else if (plot.stage === 2) {
        // Giai đoạn 2: Nảy mầm xanh
        const sprout = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 0.45, 8),
          new THREE.MeshStandardMaterial({ color: '#4ade80' })
        );
        sprout.position.y = 0.22;
        item.plantHolder.add(sprout);
      } else if (plot.stage === 3) {
        // Giai đoạn 3: Cây phát triển cành lá
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 0.85, 10),
          new THREE.MeshStandardMaterial({ color: '#22c55e' })
        );
        stem.position.y = 0.42;
        item.plantHolder.add(stem);

        const bush = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 12, 12),
          new THREE.MeshStandardMaterial({ color: '#16a34a' })
        );
        bush.position.y = 0.82;
        item.plantHolder.add(bush);
      } else if (plot.stage >= 4) {
        // Giai đoạn 4: Ra hoa / Kết trái rực rỡ sẵn sàng thu hoạch
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.14, 0.95, 10),
          new THREE.MeshStandardMaterial({ color: '#15803d' })
        );
        stem.position.y = 0.48;
        item.plantHolder.add(stem);

        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(0.46, 14, 14),
          new THREE.MeshStandardMaterial({
            color: cropInfo.color,
            emissive: cropInfo.color,
            emissiveIntensity: 0.35
          })
        );
        crown.position.y = 1.05;
        item.plantHolder.add(crown);
      }
    });
  }, [gardenPlots, visitingFriendId, remotePlayers]);

  // ============================================================================
  // ĐỒNG BỘ MÔ HÌNH 3D CĂN NHÀ RIÊNG KHI NÂNG CẤP HOẶC ĐỔI MÀU SƠN
  // ============================================================================
  useEffect(() => {
    const houseGroup = worldObjectsRef.current.houseGroup;
    if (!houseGroup) return;

    while (houseGroup.children.length > 0) {
      houseGroup.remove(houseGroup.children[0]);
    }

    const lvl = houseConfig.level || 1;
    const width = 5.4 + lvl * 1.4;
    const height = 3.4 + lvl * 1.25;
    const depth = 5.0 + lvl * 1.1;

    const wallMat = new THREE.MeshStandardMaterial({ color: houseConfig.wallColor, roughness: 0.5 });
    const roofMat = new THREE.MeshStandardMaterial({ color: houseConfig.roofColor, roughness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    houseGroup.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.82, 2.6 + lvl * 0.4, 4), roofMat);
    roof.position.y = height + (2.6 + lvl * 0.4) / 2 - 0.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    houseGroup.add(roof);

    // Cửa chính & Cửa sổ phát sáng ấm áp
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.2, 0.15),
      new THREE.MeshStandardMaterial({ color: '#78350f' })
    );
    door.position.set(0, 1.1, depth / 2 + 0.05);
    houseGroup.add(door);

    [-width * 0.28, width * 0.28].forEach((wx) => {
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.1, 0.15),
        new THREE.MeshBasicMaterial({ color: '#fef08a' })
      );
      win.position.set(wx, 2.1, depth / 2 + 0.05);
      houseGroup.add(win);
    });

    // Trang trí sân vườn nhà riêng (Đèn lồng, Cây cảnh Bonsai, Xích đu)
    if (houseConfig.decorLanterns) {
      [-2.2, 2.2].forEach((lx) => {
        const lantern = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 12, 12),
          new THREE.MeshBasicMaterial({ color: '#facc15' })
        );
        lantern.position.set(lx, 2.5, depth / 2 + 0.6);
        houseGroup.add(lantern);
      });
    }

    if (houseConfig.decorBonsai) {
      [-width * 0.42, width * 0.42].forEach((bx) => {
        const pot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.35, 0.5, 12),
          new THREE.MeshStandardMaterial({ color: '#b45309' })
        );
        pot.position.set(bx, 0.25, depth / 2 + 1.1);
        const foliage = new THREE.Mesh(
          new THREE.SphereGeometry(0.62, 12, 12),
          new THREE.MeshStandardMaterial({ color: '#4ade80' })
        );
        foliage.position.y = 0.65;
        pot.add(foliage);
        houseGroup.add(pot);
      });
    }
  }, [houseConfig]);

  // ============================================================================
  // ĐỒNG BỘ MÀU SẮC CÂY CỐI, HOA ĐÀO & CHU KỲ THỜI GIAN TỰ ĐỘNG
  // ============================================================================
  useEffect(() => {
    const wo = worldObjectsRef.current;
    wo.sakuraMeshes.forEach((m) => m.color.set(natureColors.sakuraColor));
    wo.pineMeshes.forEach((m) => m.color.set(natureColors.treeFoliageColor));
    wo.flowerMeshes.forEach((m) => {
      m.color.set(natureColors.flowerBedColor);
      if (m.emissive) m.emissive.set(natureColors.flowerBedColor);
    });
    wo.lanternMeshes.forEach((m) => {
      m.color.set(natureColors.lanternGlowColor);
      if (m.emissive) m.emissive.set(natureColors.lanternGlowColor);
    });
    if (wo.waterMesh) wo.waterMesh.color.set(natureColors.waterTint);
  }, [natureColors]);

  useEffect(() => {
    if (!autoTimeCycle) return;
    const timer = setInterval(() => {
      setTimeOfDay((prev) => (prev + 0.05) % 24);
    }, 100);
    return () => clearInterval(timer);
  }, [autoTimeCycle]);

  // ============================================================================
  // XỬ LÝ BÀN PHÍM & CHUỘT XOAY CAMERA 360 ĐỘ
  // ============================================================================
  const triggerEmoteAction = useCallback(
    (emoteObj) => {
      soundFX.playEmote();
      setActiveEmote(emoteObj);
      playerStateRef.current.emoteTimer = 3.2;
      playerStateRef.current.emoteId = emoteObj.id;

      if (emoteObj.id === 'sit') {
        playerStateRef.current.isSitting = true;
        playerStateRef.current.isLying = false;
        setIsSitting(true);
      } else if (emoteObj.id === 'lie_down') {
        playerStateRef.current.isLying = true;
        playerStateRef.current.isSitting = false;
      } else {
        playerStateRef.current.isSitting = false;
        playerStateRef.current.isLying = false;
        setIsSitting(false);
      }

      if (emoteObj.id === 'photo' && rendererRef.current) {
        const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `adiva-chibi-world-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        showToast('📸 Đã chụp và tải ảnh kỷ niệm ADIVA CHIBI WORLD!');
      } else {
        showToast(`${emoteObj.emoji} ${playerName} thực hiện: ${emoteObj.label}!`);
      }
    },
    [playerName, showToast]
  );

  const handleTriggerZoneInteraction = useCallback(() => {
    if (!nearbyZonePrompt) {
      playerStateRef.current.isSitting = !playerStateRef.current.isSitting;
      setIsSitting(playerStateRef.current.isSitting);
      showToast(playerStateRef.current.isSitting ? '🪑 Đã ngồi nghỉ thư giãn.' : '🚶 Đã đứng dậy tiếp tục khám phá.');
      return;
    }

    soundFX.playClick();
    if (nearbyZonePrompt.panel === 'tower_elevator') {
      setIsOnTowerTop((prev) => {
        const next = !prev;
        playerStateRef.current.y = next ? 13.5 : 0;
        showToast(next ? '🛗 Đã lên đỉnh Tháp Ngắm Cảnh (Độ cao 13.5m)!' : '🛗 Đã đi thang máy xuống chân tháp.');
        return next;
      });
    } else if (nearbyZonePrompt.panel === 'pagoda_modal') {
      soundFX.playBell();
      setCoins((c) => c + 35);
      setExp((e) => e + 25);
      playerStateRef.current.isSitting = true;
      setIsSitting(true);
      showToast('🪷 Đã thắp hương và ngồi thiền tịnh tâm tại Chùa Liên Hoa! (+35 Xu, +25 EXP)');
    } else if (nearbyZonePrompt.panel === 'church_modal') {
      soundFX.playBell();
      setCoins((c) => c + 35);
      setExp((e) => e + 25);
      showToast('🔔 Chuông Nhà Thờ Cổ Tích ngân vang! Bạn nhận được lời chúc bình an (+35 Xu, +25 EXP)');
    } else if (nearbyZonePrompt.panel === 'plaza_firework') {
      spawnFirework3D(FIREWORK_ITEMS[0]);
    } else {
      setActivePanel(nearbyZonePrompt.panel);
    }
  }, [nearbyZonePrompt, showToast, spawnFirework3D]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      keysRef.current[e.code] = true;

      if (e.code === 'Space' && playerStateRef.current.isGrounded) {
        playerStateRef.current.vy = 8.8;
        playerStateRef.current.isGrounded = false;
        playerStateRef.current.isSitting = false;
        playerStateRef.current.isLying = false;
        setIsSitting(false);
        soundFX.playJump();
      }

      if (e.code === 'KeyE') {
        handleTriggerZoneInteraction();
      }

      if (e.code === 'KeyC') {
        playerStateRef.current.isSitting = !playerStateRef.current.isSitting;
        setIsSitting(playerStateRef.current.isSitting);
      }

      if (e.code === 'KeyF') {
        const fw = FIREWORK_ITEMS[0];
        spawnFirework3D(fw);
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'FIREWORK_EVENT',
            senderId: localPlayerId,
            payload: { playerName, fwConfig: fw, origin: { x: playerStateRef.current.x, z: playerStateRef.current.z } }
          });
        }
        showToast('🎆 Đã bắn pháo hoa rực sáng bầu trời ADIVA!');
      }
    };

    const onKeyUp = (e) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleTriggerZoneInteraction, spawnFirework3D, localPlayerId, playerName, showToast]);

  const handleMouseDown = (e) => {
    cameraControlRef.current.isDragging = true;
    cameraControlRef.current.lastMouseX = e.clientX;
    cameraControlRef.current.lastMouseY = e.clientY;
  };

  const handleMouseMove = (e) => {
    if (!cameraControlRef.current.isDragging) return;
    const dx = e.clientX - cameraControlRef.current.lastMouseX;
    const dy = e.clientY - cameraControlRef.current.lastMouseY;
    cameraControlRef.current.lastMouseX = e.clientX;
    cameraControlRef.current.lastMouseY = e.clientY;

    cameraControlRef.current.theta -= dx * 0.007;
    cameraControlRef.current.phi = THREE.MathUtils.clamp(
      cameraControlRef.current.phi + dy * 0.006,
      -0.55,
      1.32
    );
  };

  const handleMouseUp = () => {
    cameraControlRef.current.isDragging = false;
  };

  const handleWheel = (e) => {
    cameraControlRef.current.distance = THREE.MathUtils.clamp(
      cameraControlRef.current.distance + e.deltaY * 0.01,
      4.5,
      30.0
    );
  };

  // ============================================================================
  // CÁC HÀM CHỨC NĂNG CHO 7 GIAI ĐOẠN (TRỒNG CÂY, BBQ, PHÁO HOA, CHAT, GAME)
  // ============================================================================
  const teleportToLandmark = (lm) => {
    soundFX.playClick();
    setIsOnTowerTop(false);
    playerStateRef.current.x = lm.x;
    playerStateRef.current.z = lm.z + 3.2;
    playerStateRef.current.y = 0;
    playerStateRef.current.isSitting = false;
    setIsSitting(false);
    setPlayerStatus(`Đang ở ${lm.name}`);
    showToast(`🧭 Đã di chuyển nhanh đến: ${lm.name}`);
  };

  const handleSendChat = (e) => {
    e?.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed) return;
    const newMsg = {
      id: 'm_' + Date.now(),
      sender: playerName,
      zodiac: ZODIAC_CHARACTERS[selectedZodiacIndex].zodiac.split('–')[0].trim(),
      text: trimmed,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages((prev) => [...prev.slice(-39), newMsg]);
    setChatInput('');

    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'CHAT_MSG',
        senderId: localPlayerId,
        payload: newMsg
      });
    }
    if (user && db && roomCode) {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'multiplayer_rooms', roomCode);
      setDoc(
        roomDocRef,
        { messages: [...chatMessages.slice(-25), newMsg] },
        { merge: true }
      ).catch(() => {});
    }
  };

  const handleClearChatHistory = () => {
    soundFX.playClick();
    setChatMessages([]);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'CLEAR_CHAT',
        senderId: localPlayerId,
        payload: { clearedBy: playerName }
      });
    }
    if (user && db && roomCode) {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'multiplayer_rooms', roomCode);
      setDoc(roomDocRef, { messages: [] }, { merge: true }).catch(() => {});
    }
    showToast('🧹 Đã xóa toàn bộ lịch sử trò chuyện!');
  };

  const handleDeleteSingleMessage = (messageId) => {
    soundFX.playClick();
    setChatMessages((prev) => {
      const next = prev.filter((m) => m.id !== messageId);
      if (user && db && roomCode) {
        const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'multiplayer_rooms', roomCode);
        setDoc(roomDocRef, { messages: next.slice(-25) }, { merge: true }).catch(() => {});
      }
      return next;
    });
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'DELETE_CHAT_MSG',
        senderId: localPlayerId,
        payload: { messageId }
      });
    }
  };

  const handleCreateNewRoom = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setRoomCode(code);
    setInputRoomCode(code);
    setRemotePlayers({});
    showToast(`🎉 Đã tạo phòng mới thành công! Mã phòng: ${code}`);
  };

  const handleJoinRoom = () => {
    const clean = inputRoomCode.trim().toUpperCase();
    if (!clean) return;
    if (Object.keys(remotePlayers).length >= 3 && clean === roomCode) {
      showToast('⚠️ Phòng đã đủ 4/4 người chơi!');
      return;
    }
    setRoomCode(clean);
    setRemotePlayers({});
    showToast(`🔗 Đã kết nối vào phòng Multiplayer: ${clean}`);
  };

  // --- Chức năng Nướng BBQ Lửa Trại ---
  const handleRoastBBQ = (foodItem) => {
    if (bbqCookingState) return;
    if (coins < foodItem.cost) {
      showToast('⚠️ Bạn không đủ Xu ADIVA để mua nguyên liệu nướng!');
      return;
    }
    setCoins((c) => c - foodItem.cost);
    playerStateRef.current.isSitting = true;
    setIsSitting(true);
    setBbqCookingState({ food: foodItem, progress: 0 });
    soundFX.playClick();

    let step = 0;
    const timer = setInterval(() => {
      step += 25;
      if (step >= 100) {
        clearInterval(timer);
        setBbqCookingState(null);
        setCoins((c) => c + foodItem.rewardCoins);
        setExp((e) => e + foodItem.exp);
        soundFX.playHarvest();
        showToast(
          `${foodItem.icon} Đã nướng chín thơm lừng ${foodItem.name}! Nhận +${foodItem.rewardCoins} Xu & +${foodItem.exp} EXP!`
        );
      } else {
        setBbqCookingState({ food: foodItem, progress: step });
      }
    }, (foodItem.timeSec * 1000) / 4);
  };

  // --- Chức năng Mua & Bắn Pháo Hoa ---
  const handleBuyFirework = (fw) => {
    if (coins < fw.cost) {
      showToast('⚠️ Bạn chưa đủ Xu ADIVA để mua pháo hoa này!');
      return;
    }
    setCoins((c) => c - fw.cost);
    setInventory((prev) => ({ ...prev, [fw.id]: (prev[fw.id] || 0) + 1 }));
    soundFX.playClick();
    showToast(`🎇 Đã mua 1 ${fw.name} vào túi đồ!`);
  };

  const handleLaunchFireworkItem = (fw) => {
    const count = inventory[fw.id] || 0;
    if (count <= 0) {
      if (coins >= fw.cost) {
        setCoins((c) => c - fw.cost);
      } else {
        showToast('⚠️ Bạn đã hết loại pháo hoa này và không đủ Xu mua thêm!');
        return;
      }
    } else {
      setInventory((prev) => ({ ...prev, [fw.id]: prev[fw.id] - 1 }));
    }

    // Chuyển sang bầu trời đêm nếu đang ban ngày để ngắm pháo hoa đẹp nhất
    if (timeOfDay > 6 && timeOfDay < 19) {
      setTimeOfDay(21.0);
    }

    spawnFirework3D(fw);
    setExp((e) => e + 15);
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'FIREWORK_EVENT',
        senderId: localPlayerId,
        payload: {
          playerName,
          fwConfig: fw,
          origin: { x: playerStateRef.current.x, z: playerStateRef.current.z }
        }
      });
    }
    showToast(`🎆 Đã kích hoạt ${fw.name} trên bầu trời đêm cho cả 4 người bạn cùng ngắm!`);
  };

  // --- Chức năng Trồng Cây, Chăm Sóc & Tương Tác Vườn Bạn Bè ---
  const handleInteractGardenPlot = (plotIdx) => {
    // Nếu đang thăm vườn bạn bè
    if (visitingFriendId && remotePlayers[visitingFriendId]) {
      const friend = remotePlayers[visitingFriendId];
      const fPlots = friend.gardenPlots || [];
      const targetPlot = fPlots[plotIdx];
      if (!targetPlot) return;

      if (targetPlot.stage === 4) {
        if (friend.allowGardenSteal === false) {
          showToast('🛡️ Chủ vườn đã bật Khóa Chống Trộm! Hãy giúp bạn tưới cây nhé.');
          return;
        }
        const crop = GARDEN_CROPS.find((c) => c.id === targetPlot.cropId) || GARDEN_CROPS[0];
        const bonus = Math.round(crop.sell * 0.5);
        setCoins((c) => c + bonus);
        soundFX.playHarvest();
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'GARDEN_STEAL',
            senderId: localPlayerId,
            payload: { thiefName: playerName, cropName: crop.name }
          });
        }
        showToast(`🦊 Bạn vừa hái trộm vui nhộn 1 ${crop.name} từ vườn của ${friend.name} (+${bonus} Xu)!`);
      } else {
        setCoins((c) => c + 15);
        setExp((e) => e + 10);
        soundFX.playClick();
        if (broadcastChannelRef.current) {
          broadcastChannelRef.current.postMessage({
            type: 'GARDEN_HELP',
            senderId: localPlayerId,
            payload: { helperName: playerName }
          });
        }
        showToast(`💧 Đã tưới nước giúp vườn của ${friend.name}! Nhận +15 Xu & +10 EXP tình bạn!`);
      }
      return;
    }

    // Tương tác với Khu Vườn Riêng của mình
    const plot = gardenPlots[plotIdx];
    if (!plot) return;

    if (plot.stage === 0) {
      // Gieo hạt
      const seed = GARDEN_CROPS.find((c) => c.id === selectedSeedId) || GARDEN_CROPS[0];
      if (coins < seed.cost) {
        showToast(`⚠️ Cần ${seed.cost} Xu để mua hạt giống ${seed.name}!`);
        return;
      }
      setCoins((c) => c - seed.cost);
      setGardenPlots((prev) =>
        prev.map((p, i) => (i === plotIdx ? { ...p, cropId: seed.id, stage: 1, watered: true } : p))
      );
      soundFX.playClick();
      showToast(`🌱 Đã gieo hạt ${seed.name} vào ô đất số ${plotIdx + 1}!`);
    } else if (plot.stage < 4) {
      // Tưới nước hoặc Bón phân tăng tốc
      if (!plot.watered) {
        setGardenPlots((prev) =>
          prev.map((p, i) => (i === plotIdx ? { ...p, watered: true, stage: Math.min(4, p.stage + 1) } : p))
        );
        soundFX.playClick();
        showToast(`💧 Đã tưới nước mát lành cho ô đất số ${plotIdx + 1}! Cây lớn thêm 1 giai đoạn.`);
      } else if ((inventory.fertilizer || 0) > 0) {
        setInventory((inv) => ({ ...inv, fertilizer: inv.fertilizer - 1 }));
        setGardenPlots((prev) =>
          prev.map((p, i) => (i === plotIdx ? { ...p, stage: 4 } : p))
        );
        soundFX.playHarvest();
        showToast(`✨ Đã bón phân phép thuật! Cây ở ô số ${plotIdx + 1} đã nở hoa/kết trái ngay lập tức!`);
      } else {
        showToast('🌿 Cây đã được tưới nước, sẽ lớn rất nhanh sau vài giây!');
      }
    } else {
      // Thu hoạch
      const crop = GARDEN_CROPS.find((c) => c.id === plot.cropId) || GARDEN_CROPS[0];
      setCoins((c) => c + crop.sell);
      setExp((e) => e + crop.exp);
      setGardenPlots((prev) =>
        prev.map((p, i) => (i === plotIdx ? { ...p, cropId: null, stage: 0, watered: false } : p))
      );
      soundFX.playHarvest();
      showToast(`${crop.icon} Thu hoạch thành công ${crop.name}! Nhận +${crop.sell} Xu & +${crop.exp} EXP!`);
    }
  };

  // --- Chức năng Trò Chơi Dân Gian: Ô Ăn Quan ---
  const handlePlayOAnQuan = (pitIndex) => {
    if (pitIndex === 0 || pitIndex === 6 || oAnQuanBoard[pitIndex] === 0) return;
    soundFX.playClick();
    const board = [...oAnQuanBoard];
    let stones = board[pitIndex];
    board[pitIndex] = 0;
    let cur = pitIndex;

    while (stones > 0) {
      cur = (cur + 1) % 12;
      board[cur]++;
      stones--;
    }

    const nextPit = (cur + 1) % 12;
    let captured = 0;
    if (board[nextPit] === 0) {
      const targetPit = (nextPit + 1) % 12;
      if (board[targetPit] > 0) {
        captured = board[targetPit];
        board[targetPit] = 0;
      }
    }

    setOAnQuanBoard(board);
    if (captured > 0) {
      setOAnQuanScore((prev) => ({ ...prev, player: prev.player + captured }));
      setCoins((c) => c + captured * 5);
      setExp((e) => e + 15);
      soundFX.playHarvest();
      showToast(`🎉 Bạn ăn được ${captured} quân cờ Ô Ăn Quan! Nhận +${captured * 5} Xu!`);
    } else {
      setOAnQuanTurn((t) => (t === 'player' ? 'friend' : 'player'));
    }
  };

  // --- Chức năng Trò Chơi Dân Gian: Cờ Caro 8x8 ---
  const handlePlayCaro = (cellIdx) => {
    if (caroBoard[cellIdx] || caroWinner) return;
    soundFX.playClick();
    const next = [...caroBoard];
    next[cellIdx] = caroTurn;

    const checkWin = (b, sym) => {
      const dirs = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
      ];
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          for (const [dr, dc] of dirs) {
            let cnt = 0;
            for (let k = 0; k < 4; k++) {
              const nr = r + dr * k;
              const nc = c + dc * k;
              if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr * 8 + nc] === sym) cnt++;
            }
            if (cnt === 4) return true;
          }
        }
      }
      return false;
    };

    if (checkWin(next, caroTurn)) {
      setCaroBoard(next);
      setCaroWinner(caroTurn);
      setCoins((c) => c + 80);
      setExp((e) => e + 40);
      soundFX.playHarvest();
      showToast(`🏆 Chúc mừng! Quân ${caroTurn} đã chiến thắng ván Cờ Caro! (+80 Xu, +40 EXP)`);
      return;
    }

    setCaroBoard(next);
    setCaroTurn(caroTurn === 'X' ? 'O' : 'X');
  };

  // --- Chức năng Lật Thẻ Ghi Nhớ ---
  const handleFlipMemoryCard = (idx) => {
    if (flippedIndices.length >= 2 || memoryCards[idx].flipped || memoryCards[idx].matched) return;
    soundFX.playClick();
    const updated = memoryCards.map((c, i) => (i === idx ? { ...c, flipped: true } : c));
    const nextFlipped = [...flippedIndices, idx];
    setMemoryCards(updated);
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      const [first, second] = nextFlipped;
      if (updated[first].symbol === updated[second].symbol) {
        setTimeout(() => {
          setMemoryCards((prev) =>
            prev.map((c, i) => (i === first || i === second ? { ...c, matched: true } : c))
          );
          setFlippedIndices([]);
          setCoins((c) => c + 30);
          setExp((e) => e + 15);
          soundFX.playHarvest();
          showToast('✨ Ghép đúng cặp biểu tượng văn hóa! (+30 Xu)');
        }, 400);
      } else {
        setTimeout(() => {
          setMemoryCards((prev) =>
            prev.map((c, i) => (i === first || i === second ? { ...c, flipped: false } : c))
          );
          setFlippedIndices([]);
        }, 850);
      }
    }
  };

  const currentZodiac = ZODIAC_CHARACTERS[selectedZodiacIndex];
  const currentPet = PET_COMPANIONS[selectedPetIndex];
  const onlinePlayersCount = 1 + Object.keys(remotePlayers).length;

  const formatTimeLabel = (val) => {
    const hrs = Math.floor(val);
    const mins = Math.floor((val - hrs) * 60);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none text-white">
      {/* ==================================================================== */}
      {/* CANVAS 3D THẾ GIỚI MỞ ADIVA CHIBI WORLD                              */}
      {/* ==================================================================== */}
      <div
        ref={mountRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />

      {/* ==================================================================== */}
      {/* 1. THANH HEADER TRÊN CÙNG: THÔNG TIN NHÂN VẬT, TIỀN XU, PHÒNG & GIỜ   */}
      {/* ==================================================================== */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-start justify-between gap-2 z-20">
        {/* Card Nhân vật & Tiền tệ */}
        <div className="pointer-events-auto flex items-center gap-3 bg-slate-900/80 backdrop-blur-xl border border-white/15 rounded-2xl px-3.5 py-2 shadow-2xl">
          <div
            onClick={() => setActivePanel(activePanel === 'character' ? null : 'character')}
            className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-lg shadow-inner border border-white/30 cursor-pointer hover:scale-105 transition"
            style={{ backgroundColor: currentZodiac.primaryColor }}
          >
            {currentZodiac.zodiac.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-wide text-white">{playerName}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold">
                Cấp {playerLevel}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-500/25 text-yellow-300 border border-yellow-400/40 font-extrabold">
                🪙 {coins.toLocaleString()} Xu
              </span>
            </div>
            <div className="text-[11px] text-sky-200/90 flex items-center gap-2 mt-0.5">
              <span>🐾 {currentPet.name} (Lv.{petLevel})</span>
              <span>•</span>
              <span className="text-emerald-300 font-semibold">{playerStatus}</span>
            </div>
          </div>
        </div>

        {/* Cụm Điều Khiển Phòng Multiplayer 4 Người & Thời Gian Ngày/Đêm */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 bg-slate-900/80 backdrop-blur-xl border border-white/15 rounded-2xl px-3 py-2 shadow-2xl">
          {/* Nút Phòng Online 4 Người */}
          <button
            onClick={() => setActivePanel(activePanel === 'multiplayer' ? null : 'multiplayer')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold transition"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Phòng: {roomCode} ({onlinePlayersCount}/4)</span>
          </button>

          <div className="h-5 w-px bg-white/15" />

          {/* Chọn nhanh Ban Ngày / Hoàng Hôn / Ban Đêm */}
          <button
            onClick={() => {
              soundFX.playClick();
              setAutoTimeCycle(false);
              setTimeOfDay(10.5);
              showToast('☀️ Đã chuyển sang Ban Ngày nắng ấm!');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
              timeOfDay >= 6.5 && timeOfDay < 16.5
                ? 'bg-amber-400 text-slate-950 shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Sun className="w-3.5 h-3.5" /> Ngày
          </button>

          <button
            onClick={() => {
              soundFX.playClick();
              setAutoTimeCycle(false);
              setTimeOfDay(17.8);
              showToast('🌅 Đã chuyển sang Hoàng Hôn tím hồng!');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
              timeOfDay >= 16.5 && timeOfDay < 19.2
                ? 'bg-rose-500 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Sunset className="w-3.5 h-3.5" /> Hoàng Hôn
          </button>

          <button
            onClick={() => {
              soundFX.playClick();
              setAutoTimeCycle(false);
              setTimeOfDay(21.5);
              showToast('🌙 Đã chuyển sang Đêm Trăng Sao, Đom Đóm & Ngân Hà!');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
              timeOfDay >= 19.2 || timeOfDay < 5.5
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-white'
            }`}
          >
            <Moon className="w-3.5 h-3.5" /> Đêm Sao
          </button>

          {/* Nút Ngắm Bầu Trời Sao */}
          <button
            onClick={() => {
              soundFX.playClick();
              const next = !skyGazingMode;
              setSkyGazingMode(next);
              if (next && timeOfDay > 6 && timeOfDay < 19) setTimeOfDay(21.5);
              showToast(next ? '🔭 Đang bật chế độ Ngắm Sao & Dải Ngân Hà!' : '📷 Đã trở về góc nhìn mặc định.');
            }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
              skyGazingMode
                ? 'bg-purple-500 text-white ring-2 ring-purple-300'
                : 'bg-white/10 hover:bg-white/20 text-purple-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Ngắm Sao
          </button>

          <span className="text-[11px] font-mono text-sky-300 px-1.5">{formatTimeLabel(timeOfDay)}</span>

          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundFX.enabled = next;
            }}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white"
            title="Bật/Tắt Âm Thanh"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-300" /> : <VolumeX className="w-4 h-4 text-rose-300" />}
          </button>
        </div>

        {/* Mini-Map Radar Thời Gian Thực (Góc phải trên) */}
        <div className="pointer-events-auto bg-slate-900/85 backdrop-blur-xl border border-white/15 rounded-2xl p-2.5 shadow-2xl flex items-center gap-3">
          <div
            onClick={() => setActivePanel(activePanel === 'map' ? null : 'map')}
            className="relative w-24 h-24 rounded-full bg-emerald-950/90 border-2 border-sky-400/50 overflow-hidden cursor-pointer group"
            title="Bấm để mở Bản Đồ Lớn & Dịch Chuyển Nhanh"
          >
            {/* Dòng suối trên Mini-map */}
            <div className="absolute left-0 right-0 top-[63%] h-2.5 bg-sky-500/50" />
            {/* Chấm các địa điểm */}
            {WORLD_LANDMARKS.map((lm) => (
              <div
                key={lm.id}
                className="absolute w-2 h-2 rounded-full -translate-x-1 -translate-y-1"
                style={{
                  left: `${50 + (lm.x / 60) * 45}%`,
                  top: `${50 + (lm.z / 60) * 45}%`,
                  backgroundColor: lm.color
                }}
                title={lm.name}
              />
            ))}
            {/* Chấm của 3 người bạn */}
            {Object.values(remotePlayers).map((rp) => (
              <div
                key={rp.id}
                className="absolute w-2.5 h-2.5 rounded-full bg-amber-400 border border-white -translate-x-1 -translate-y-1 animate-pulse"
                style={{
                  left: `${50 + ((rp.x || 0) / 60) * 45}%`,
                  top: `${50 + ((rp.z || 0) / 60) * 45}%`
                }}
              />
            ))}
            {/* Chấm của Người chơi chính */}
            <div
              className="absolute w-3 h-3 rounded-full bg-white border-2 border-rose-500 -translate-x-1.5 -translate-y-1.5 shadow"
              style={{
                left: `${50 + (playerCoords.x / 60) * 45}%`,
                top: `${50 + (playerCoords.z / 60) * 45}%`
              }}
            />
          </div>
          <div className="text-xs pr-1">
            <div className="font-bold text-sky-300 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5" /> Bản Đồ ADIVA
            </div>
            <div className="text-[11px] text-slate-300 font-mono mt-0.5">
              X:{playerCoords.x} • Z:{playerCoords.z}
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">{fps} FPS</div>
            <button
              onClick={() => setActivePanel(activePanel === 'map' ? null : 'map')}
              className="mt-1 px-2 py-0.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-[10px] text-sky-200 font-bold"
            >
              Mở Bản Đồ Lớn
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. GỢI Ý TƯƠNG TÁC KHI ĐẾN GẦN CÁC KHU VỰC TRONG THẾ GIỚI 3D         */}
      {/* ==================================================================== */}
      {nearbyZonePrompt && (
        <div className="pointer-events-auto absolute top-24 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 backdrop-blur-xl border-2 border-amber-400/70 rounded-2xl px-5 py-2.5 shadow-2xl flex items-center gap-4 animate-bounce">
          <div>
            <div className="text-xs font-black text-amber-300">{nearbyZonePrompt.title}</div>
            <div className="text-[11px] text-slate-200">{nearbyZonePrompt.actionLabel}</div>
          </div>
          <button
            onClick={handleTriggerZoneInteraction}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 font-black text-xs shadow hover:scale-105 transition"
          >
            Tương Tác Ngay
          </button>
        </div>
      )}

      {/* Toast thông báo nổi */}
      {toastMessage && (
        <div className="pointer-events-none absolute top-40 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-sky-400/50 text-white px-4 py-2 rounded-full text-xs font-bold shadow-2xl">
          {toastMessage}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. KHUNG CHAT TRỰC TUYẾN 4 NGƯỜI CHƠI (GÓC TRÁI DƯỚI, THU GỌN ĐƯỢC) */}
      {/* ==================================================================== */}
      <div className="pointer-events-auto absolute bottom-20 left-3 z-20 w-80 max-w-[88vw]">
        {isChatCollapsed ? (
          <button
            onClick={() => setIsChatCollapsed(false)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/85 backdrop-blur-xl border border-sky-400/40 text-sky-200 text-xs font-bold shadow-xl hover:bg-slate-800 transition"
          >
            <MessageCircle className="w-4 h-4 text-sky-400" />
            <span>Mở Chat Phòng {roomCode} ({chatMessages.length})</span>
            <ChevronUp className="w-4 h-4" />
          </button>
        ) : (
          <div className="bg-slate-900/85 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3.5 py-2 bg-slate-800/80 border-b border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-sky-300">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Chat Trực Tuyến ({onlinePlayersCount}/4 Người)</span>
              </div>
              <div className="flex items-center gap-1.5">
                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearChatHistory}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-300 text-[10px] font-bold transition"
                    title="Xóa toàn bộ lịch sử trò chuyện"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Xóa lịch sử</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsChatCollapsed(true)}
                  className="text-slate-400 hover:text-white p-0.5"
                  title="Thu gọn khung chat"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="h-36 overflow-y-auto px-3 py-2 space-y-1.5 text-xs">
              {chatMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-slate-400 italic">
                  Lịch sử trò chuyện trống. Hãy gửi lời chào tới bạn bè nhé!
                </div>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id} className="group relative leading-snug bg-white/5 hover:bg-white/10 rounded-xl px-2.5 py-1.5 transition">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pr-4">
                      <span className="font-bold text-amber-300">
                        [{m.zodiac}] {m.sender}
                      </span>
                      <span>{m.time}</span>
                    </div>
                    <div className="text-slate-100 mt-0.5 break-words pr-4">{m.text}</div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSingleMessage(m.id)}
                      className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 p-0.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 transition"
                      title="Xóa tin nhắn này"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="flex items-center border-t border-white/10 bg-slate-950/60 px-2 py-1.5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Nhắn tin với bạn bè (Enter)..."
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none px-2"
              />
              <button
                type="submit"
                className="p-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 4. THANH DOCK CHỨC NĂNG BÊN DƯỚI (ĐẦY ĐỦ 7 GIAI ĐOẠN)               */}
      {/* ==================================================================== */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-center z-20">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 bg-slate-900/90 backdrop-blur-2xl border border-white/15 rounded-2xl px-3 py-2 shadow-2xl">
          <button
            onClick={() => setActivePanel(activePanel === 'character' ? null : 'character')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'character'
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-slate-100'
            }`}
          >
            <User className="w-4 h-4" />
            <span>12 Con Giáp & Pet</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'multiplayer' ? null : 'multiplayer')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'multiplayer'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Phòng 4 Người ({onlinePlayersCount}/4)</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'camping_firework' ? null : 'camping_firework')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'camping_firework'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-amber-200'
            }`}
          >
            <Flame className="w-4 h-4 text-orange-400" />
            <span>Cắm Trại & Bán Pháo Hoa</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'garden_house' ? null : 'garden_house')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'garden_house'
                ? 'bg-gradient-to-r from-lime-500 to-emerald-500 text-slate-950 shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-lime-200'
            }`}
          >
            <Sprout className="w-4 h-4 text-lime-400" />
            <span>Trồng Cây & Nhà Riêng</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'folk_cultural' ? null : 'folk_cultural')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'folk_cultural'
                ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-purple-200'
            }`}
          >
            <Trophy className="w-4 h-4 text-yellow-300" />
            <span>Trò Chơi Dân Gian & Văn Hóa</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'emotes' ? null : 'emotes')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'emotes'
                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-slate-100'
            }`}
          >
            <Smile className="w-4 h-4" />
            <span>15 Biểu Cảm</span>
          </button>

          <button
            onClick={() => setActivePanel(activePanel === 'color' ? null : 'color')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${
              activePanel === 'color'
                ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-lg'
                : 'bg-white/10 hover:bg-white/20 text-slate-100'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Đổi Màu Cây</span>
          </button>

          <button
            onClick={() => handleLaunchFireworkItem(FIREWORK_ITEMS[0])}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400 text-white shadow-lg transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Bắn Pháo Hoa (F)</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: CẮM TRẠI LỬA TRẠI BBQ & QUẦY BÁN PHÁO HOA                   */}
      {/* ==================================================================== */}
      {activePanel === 'camping_firework' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl bg-slate-900 border border-amber-400/40 rounded-3xl p-6 shadow-2xl max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
              <div>
                <h2 className="text-xl font-black text-amber-300 flex items-center gap-2">
                  🔥 KHU CẮM TRẠI VEN SUỐI & QUẦY BÁN PHÁO HOA ĐÊM
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Cùng 4 người bạn ngồi quanh lửa trại nướng đồ ăn thơm lừng và mua các loại pháo hoa rực rỡ bắn lên bầu trời!
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => teleportToLandmark(WORLD_LANDMARKS[1])}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-bold"
                >
                  📍 Dịch chuyển tới Lửa Trại
                </button>
                <button
                  onClick={() => setActivePanel(null)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  Đóng ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cột Trái: Lửa Trại & Nướng BBQ */}
              <div className="bg-slate-800/70 border border-orange-400/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-extrabold text-sm text-orange-300 flex items-center gap-1.5">
                    🍢 Bếp Lửa Trại BBQ & Ngắm Sao
                  </h3>
                  <span className="text-xs font-bold text-yellow-300">🪙 {coins} Xu</span>
                </div>

                {bbqCookingState && (
                  <div className="mb-4 p-3 rounded-xl bg-orange-500/20 border border-orange-400/50">
                    <div className="text-xs font-bold text-orange-200 mb-1">
                      🔥 Đang nướng {bbqCookingState.food.name}... ({bbqCookingState.progress}%)
                    </div>
                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all"
                        style={{ width: `${bbqCookingState.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  {BBQ_FOODS.map((food) => (
                    <div
                      key={food.id}
                      className="flex items-center justify-between bg-slate-900/80 border border-white/10 rounded-xl px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{food.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-white">{food.name}</div>
                          <div className="text-[11px] text-emerald-300">
                            Chi phí: {food.cost} Xu • Thưởng: +{food.rewardCoins} Xu & +{food.exp} EXP
                          </div>
                        </div>
                      </div>
                      <button
                        disabled={Boolean(bbqCookingState)}
                        onClick={() => handleRoastBBQ(food)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs shadow"
                      >
                        Nướng Ngay
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      teleportToLandmark(WORLD_LANDMARKS[1]);
                      playerStateRef.current.isSitting = true;
                      setIsSitting(true);
                      setActivePanel(null);
                      showToast('🪑 Bạn đã ngồi quanh đống lửa trại ấm áp cùng bạn bè!');
                    }}
                    className="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-amber-200"
                  >
                    🪑 Ngồi Quanh Lửa Trại
                  </button>
                  <button
                    onClick={() => {
                      setTimeOfDay(21.5);
                      setSkyGazingMode(true);
                      setActivePanel(null);
                      showToast('🌌 Đã chuyển sang chế độ Cùng Nhau Ngắm Sao Đêm!');
                    }}
                    className="flex-1 py-2 rounded-xl bg-indigo-500/30 hover:bg-indigo-500/40 border border-indigo-400/40 text-xs font-bold text-indigo-200"
                  >
                    🌌 Cùng Ngắm Sao Đêm
                  </button>
                </div>
              </div>

              {/* Cột Phải: Quầy Bán & Bắn Pháo Hoa Sự Kiện */}
              <div className="bg-slate-800/70 border border-pink-400/30 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-extrabold text-sm text-pink-300 flex items-center gap-1.5">
                    🎆 Quầy Bán Pháo Hoa & Đại Tiệc Ánh Sáng
                  </h3>
                  <span className="text-[11px] text-sky-300">Đồng bộ 4 người chơi</span>
                </div>

                <div className="space-y-2.5">
                  {FIREWORK_ITEMS.map((fw) => (
                    <div
                      key={fw.id}
                      className="bg-slate-900/80 border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-white">{fw.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-bold">
                            Đang có: {inventory[fw.id] || 0}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{fw.desc}</p>
                        <div className="text-[11px] text-amber-300 font-bold mt-0.5">Giá: {fw.cost} Xu</div>
                      </div>

                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          onClick={() => handleBuyFirework(fw)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-amber-300"
                        >
                          + Mua ({fw.cost} Xu)
                        </button>
                        <button
                          onClick={() => {
                            handleLaunchFireworkItem(fw);
                            setActivePanel(null);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white text-[11px] font-black shadow"
                        >
                          🎆 Bắn Ngay
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: KHU VƯỜN 3D (12 Ô TRỒNG CÂY) & HỆ THỐNG NHÀ RIÊNG          */}
      {/* ==================================================================== */}
      {activePanel === 'garden_house' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className="w-full max-w-5xl bg-slate-900 border border-lime-400/40 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4 mb-5">
              <div>
                <h2 className="text-xl font-black text-lime-300 flex items-center gap-2">
                  🌱 KHU VƯỜN 3D RIÊNG & TRANG TRÍ NHÀ CỬA
                </h2>
                <p className="text-xs text-slate-300">
                  Cây trồng hiển thị trực tiếp trên 12 ô đất 3D bên cạnh căn nhà của bạn! Có thể qua thăm vườn bạn bè.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => teleportToLandmark(WORLD_LANDMARKS[2])}
                  className="px-3 py-1.5 rounded-xl bg-lime-500/20 hover:bg-lime-500/30 border border-lime-400/40 text-lime-300 text-xs font-bold"
                >
                  📍 Đến Khu Vườn 3D
                </button>
                <button
                  onClick={() => setActivePanel(null)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  Đóng ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Cột Trái (7 phần): 12 Ô Đất Khu Vườn & Chọn Hạt Giống */}
              <div className="lg:col-span-7 bg-slate-800/70 border border-lime-400/30 rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVisitingFriendId(null)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold ${
                        !visitingFriendId ? 'bg-lime-400 text-slate-950' : 'bg-white/10 text-white'
                      }`}
                    >
                      🏡 Vườn Của Tôi
                    </button>
                    {Object.values(remotePlayers).map((rp) => (
                      <button
                        key={rp.id}
                        onClick={() => setVisitingFriendId(rp.id)}
                        className={`px-3 py-1 rounded-xl text-xs font-bold ${
                          visitingFriendId === rp.id ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-amber-200'
                        }`}
                      >
                        👀 Vườn của {rp.name}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      setAllowGardenSteal((s) => !s);
                      showToast(!allowGardenSteal ? '🔓 Đã cho phép bạn bè hái rau vui nhộn!' : '🛡️ Đã bật Khóa Chống Trộm Vườn!');
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                      allowGardenSteal
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    }`}
                  >
                    {allowGardenSteal ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{allowGardenSteal ? 'Cho phép trộm vui' : 'Đã khóa chống trộm'}</span>
                  </button>
                </div>

                {/* Danh sách chọn hạt giống (Hoa & Rau củ) */}
                {!visitingFriendId && (
                  <div className="mb-4">
                    <div className="text-xs font-bold text-slate-300 mb-2">
                      1. Chọn hạt giống muốn gieo (Đang có 🪙 {coins} Xu • Phân bón: {inventory.fertilizer || 0}):
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {GARDEN_CROPS.map((crop) => (
                        <button
                          key={crop.id}
                          onClick={() => setSelectedSeedId(crop.id)}
                          className={`flex items-center gap-1.5 p-2 rounded-xl border text-left transition ${
                            selectedSeedId === crop.id
                              ? 'bg-lime-500/25 border-lime-400 text-white'
                              : 'bg-slate-900/70 border-white/10 text-slate-300 hover:bg-slate-900'
                          }`}
                        >
                          <span className="text-lg">{crop.icon}</span>
                          <div className="overflow-hidden">
                            <div className="text-[11px] font-bold truncate">{crop.name}</div>
                            <div className="text-[10px] text-amber-300">-{crop.cost} Xu / +{crop.sell}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lưới 12 Ô Đất Trồng Cây */}
                <div className="text-xs font-bold text-slate-300 mb-2">
                  2. Bấm vào ô đất bên dưới để Gieo hạt / Tưới nước / Bón phân / Thu hoạch:
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {(visitingFriendId && remotePlayers[visitingFriendId]?.gardenPlots
                    ? remotePlayers[visitingFriendId].gardenPlots
                    : gardenPlots
                  ).map((plot, idx) => {
                    const crop = GARDEN_CROPS.find((c) => c.id === plot.cropId);
                    const stageLabels = ['Đất trống', 'Gieo hạt 🌱', 'Nảy mầm 🌿', 'Đang lớn 🌳', 'Thu hoạch ✨'];
                    return (
                      <button
                        key={plot.id}
                        onClick={() => handleInteractGardenPlot(idx)}
                        className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center min-h-[92px] ${
                          plot.stage === 4
                            ? 'bg-amber-500/25 border-amber-400 animate-pulse'
                            : plot.stage > 0
                            ? 'bg-emerald-950/70 border-emerald-500/40'
                            : 'bg-stone-900/80 border-white/10 hover:border-lime-400/50'
                        }`}
                      >
                        <div className="text-2xl mb-1">{crop ? crop.icon : '🟫'}</div>
                        <div className="text-[11px] font-extrabold text-white truncate max-w-full">
                          {crop ? crop.name : `Ô Đất #${idx + 1}`}
                        </div>
                        <div className="text-[10px] text-lime-300 font-semibold mt-0.5">
                          {stageLabels[plot.stage || 0]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cột Phải (5 phần): Hệ Thống Nhà Riêng & Trang Trí Nội Ngoại Thất */}
              <div className="lg:col-span-5 bg-slate-800/70 border border-sky-400/30 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-sky-300 flex items-center gap-1.5 mb-3">
                    🏠 Hệ Thống Nhà Riêng 3D & Trang Trí
                  </h3>

                  <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-white">
                          Cấp độ Nhà hiện tại: Cấp {houseConfig.level}/3
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {houseConfig.level === 1
                            ? 'Nhà Gỗ Cổ Tích Ấm Áp'
                            : houseConfig.level === 2
                            ? 'Biệt Thự Sân Vườn ADIVA'
                            : 'Lâu Đài Ánh Sáng Hoàng Gia'}
                        </div>
                      </div>
                      {houseConfig.level < 3 && (
                        <button
                          onClick={() => {
                            const cost = houseConfig.level * 300;
                            if (coins < cost) {
                              showToast(`⚠️ Cần ${cost} Xu để nâng cấp nhà!`);
                              return;
                            }
                            setCoins((c) => c - cost);
                            setHouseConfig((h) => ({ ...h, level: h.level + 1 }));
                            soundFX.playHarvest();
                            showToast(`🏰 Đã nâng cấp Căn Nhà 3D lên Cấp ${houseConfig.level + 1}!`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-indigo-500 text-slate-950 font-black text-xs"
                        >
                          Nâng Cấp ({houseConfig.level * 300} Xu)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Đổi màu Sơn Tường & Mái Ngói */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-slate-900/80 border border-white/10 rounded-xl p-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">🎨 Màu Sơn Tường</span>
                      <input
                        type="color"
                        value={houseConfig.wallColor}
                        onChange={(e) => setHouseConfig((h) => ({ ...h, wallColor: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent"
                      />
                    </div>
                    <div className="bg-slate-900/80 border border-white/10 rounded-xl p-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">🏠 Màu Mái Nhà</span>
                      <input
                        type="color"
                        value={houseConfig.roofColor}
                        onChange={(e) => setHouseConfig((h) => ({ ...h, roofColor: e.target.value }))}
                        className="w-8 h-8 rounded cursor-pointer bg-transparent"
                      />
                    </div>
                  </div>

                  {/* Vật phẩm trang trí nhà & sân vườn */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2">
                      <span className="text-xs text-slate-200">🏮 Đèn Lồng Phát Sáng TrướcHiên</span>
                      <button
                        onClick={() => setHouseConfig((h) => ({ ...h, decorLanterns: !h.decorLanterns }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          houseConfig.decorLanterns ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {houseConfig.decorLanterns ? 'Đang Bật' : 'Đang Tắt'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2">
                      <span className="text-xs text-slate-200">🪴 Chậu Cây Cảnh Bonsai Đón Khách</span>
                      <button
                        onClick={() => setHouseConfig((h) => ({ ...h, decorBonsai: !h.decorBonsai }))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          houseConfig.decorBonsai ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-slate-300'
                        }`}
                      >
                        {houseConfig.decorBonsai ? 'Đang Đặt' : 'Đã Cất'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2">
                      <span className="text-xs text-slate-200">✨ Mua Thêm 5 Túi Phân Bón Siêu Tốc</span>
                      <button
                        onClick={() => {
                          if (coins < 50) {
                            showToast('⚠️ Cần 50 Xu để mua gói phân bón!');
                            return;
                          }
                          setCoins((c) => c - 50);
                          setInventory((inv) => ({ ...inv, fertilizer: (inv.fertilizer || 0) + 5 }));
                          soundFX.playClick();
                          showToast('✨ Đã mua thêm 5 túi phân bón tăng tốc!');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-xs font-black"
                      >
                        Mua (50 Xu)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-[11px] text-slate-400 bg-slate-950/60 rounded-xl p-2.5">
                  💡 Mẹo: Mọi thay đổi về Cấp độ Nhà, Màu sơn, Mái ngói và Cây trồng đều cập nhật trực tiếp ngoài Thế giới 3D tại tọa độ (X: 24, Z: 25)!
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: KHU TRÒ CHƠI DÂN GIAN & HÀNH TRÌNH VĂN HÓA VIỆT NAM         */}
      {/* ==================================================================== */}
      {activePanel === 'folk_cultural' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl bg-slate-900 border border-purple-400/40 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4 mb-4">
              <div>
                <h2 className="text-xl font-black text-purple-300 flex items-center gap-2">
                  🏮 KHU TRÒ CHƠI DÂN GIAN & HÀNH TRÌNH VĂN HÓA VIỆT NAM
                </h2>
                <p className="text-xs text-slate-300">
                  Tham gia trò chơi truyền thống và khám phá văn hóa cùng 4 người bạn để nhận Xu ADIVA & Bảo Vật!
                </p>
              </div>
              <button
                onClick={() => setActivePanel(null)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
              >
                Đóng ✕
              </button>
            </div>

            {/* Menu chọn Trò chơi dân gian */}
            <div className="flex flex-wrap gap-2 mb-5">
              {[
                { id: 'o_an_quan', label: '🪨 Ô Ăn Quan' },
                { id: 'caro', label: '❌⭕ Cờ Caro 8x8' },
                { id: 'rps', label: '✌️✊✋ Kéo Búa Bao' },
                { id: 'proverb', label: '🖼️ Đuổi Hình Bắt Chữ Tục Ngữ' },
                { id: 'memory', label: '🃏 Lật Thẻ Ghi Nhớ' },
                { id: 'cultural_quest', label: '🇻🇳 Hành Trình Văn Hóa 4 Người' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFolkGame(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                    activeFolkGame === tab.id
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 1. Bàn chơi Ô Ăn Quan */}
            {activeFolkGame === 'o_an_quan' && (
              <div className="bg-slate-800/80 border border-amber-400/30 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-bold text-amber-300">
                    Luật chơi: Bấm vào 1 trong 10 ô Dân để rải đá. Nếu ô tiếp theo trống, bạn ăn toàn bộ đá ở ô kế tiếp!
                  </div>
                  <div className="text-xs font-black text-emerald-300">
                    Điểm của bạn: {oAnQuanScore.player} đá
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2 items-center bg-amber-950/50 border-2 border-amber-500/40 rounded-3xl p-4">
                  {/* Ô Quan Trái (Index 0) */}
                  <div className="row-span-2 h-28 rounded-l-3xl bg-amber-500/20 border-2 border-amber-400 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-amber-300">Ô QUAN</span>
                    <span className="text-2xl font-black text-white mt-1">💎 {oAnQuanBoard[0]}</span>
                  </div>

                  {/* Hàng trên: Ô 1 -> 5 */}
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      onClick={() => handlePlayOAnQuan(i)}
                      className="h-14 rounded-xl bg-slate-900/90 hover:bg-amber-500/30 border border-amber-300/30 flex flex-col items-center justify-center transition"
                    >
                      <span className="text-[10px] text-slate-400">Ô Dân #{i}</span>
                      <span className="text-sm font-black text-amber-200">🪨 {oAnQuanBoard[i]}</span>
                    </button>
                  ))}

                  {/* Ô Quan Phải (Index 6) */}
                  <div className="row-span-2 h-28 rounded-r-3xl bg-amber-500/20 border-2 border-amber-400 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-amber-300">Ô QUAN</span>
                    <span className="text-2xl font-black text-white mt-1">💎 {oAnQuanBoard[6]}</span>
                  </div>

                  {/* Hàng dưới: Ô 11 -> 7 */}
                  {[11, 10, 9, 8, 7].map((i) => (
                    <button
                      key={i}
                      onClick={() => handlePlayOAnQuan(i)}
                      className="h-14 rounded-xl bg-slate-900/90 hover:bg-amber-500/30 border border-amber-300/30 flex flex-col items-center justify-center transition"
                    >
                      <span className="text-[10px] text-slate-400">Ô Dân #{i}</span>
                      <span className="text-sm font-black text-amber-200">🪨 {oAnQuanBoard[i]}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setOAnQuanBoard([10, 5, 5, 5, 5, 5, 10, 5, 5, 5, 5, 5]);
                    setOAnQuanScore({ player: 0, friend: 0 });
                  }}
                  className="mt-4 px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  🔄 Xếp Lại Bàn Ô Ăn Quan
                </button>
              </div>
            )}

            {/* 2. Bàn chơi Cờ Caro 8x8 */}
            {activeFolkGame === 'caro' && (
              <div className="bg-slate-800/80 border border-sky-400/30 rounded-2xl p-5 flex flex-col items-center">
                <div className="flex items-center justify-between w-full max-w-md mb-3">
                  <span className="text-xs font-bold text-sky-300">
                    Lượt đi hiện tại: <strong className="text-amber-300">{caroTurn}</strong> (Ghép 4 ô liên tiếp để thắng)
                  </span>
                  <button
                    onClick={() => {
                      setCaroBoard(Array(64).fill(null));
                      setCaroWinner(null);
                      setCaroTurn('X');
                    }}
                    className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
                  >
                    Ván Mới
                  </button>
                </div>

                <div className="grid grid-cols-8 gap-1.5 bg-slate-950 p-3 rounded-2xl border border-white/15">
                  {caroBoard.map((cell, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePlayCaro(idx)}
                      className="w-10 h-10 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 flex items-center justify-center text-base font-black"
                    >
                      {cell === 'X' && <span className="text-rose-400">✕</span>}
                      {cell === 'O' && <span className="text-sky-400">◯</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Kéo Búa Bao */}
            {activeFolkGame === 'rps' && (
              <div className="bg-slate-800/80 border border-pink-400/30 rounded-2xl p-6 text-center">
                <h3 className="text-sm font-extrabold text-pink-300 mb-4">
                  Chọn Kéo, Búa hoặc Bao để so tài nhanh (Thắng nhận +40 Xu):
                </h3>
                <div className="flex justify-center gap-4 mb-5">
                  {[
                    { id: 'Kéo', icon: '✌️' },
                    { id: 'Búa', icon: '✊' },
                    { id: 'Bao', icon: '✋' }
                  ].map((choice) => (
                    <button
                      key={choice.id}
                      onClick={() => {
                        const opts = ['Kéo', 'Búa', 'Bao'];
                        const bot = opts[Math.floor(Math.random() * 3)];
                        let outcome = 'Hòa nhau!';
                        if (
                          (choice.id === 'Kéo' && bot === 'Bao') ||
                          (choice.id === 'Búa' && bot === 'Kéo') ||
                          (choice.id === 'Bao' && bot === 'Búa')
                        ) {
                          outcome = '🎉 Bạn Chiến Thắng! (+40 Xu)';
                          setCoins((c) => c + 40);
                          setExp((e) => e + 20);
                          soundFX.playHarvest();
                        } else if (choice.id !== bot) {
                          outcome = '😅 Chưa may mắn, thử lại nhé!';
                          soundFX.playClick();
                        }
                        setRpsResult({ player: choice.id, bot, outcome });
                      }}
                      className="px-6 py-4 rounded-2xl bg-slate-900 hover:bg-pink-500/20 border border-pink-400/40 flex flex-col items-center gap-1 transition hover:scale-105"
                    >
                      <span className="text-4xl">{choice.icon}</span>
                      <span className="text-xs font-extrabold">{choice.id}</span>
                    </button>
                  ))}
                </div>
                {rpsResult && (
                  <div className="text-sm font-bold text-amber-300 bg-slate-950/70 py-3 px-4 rounded-xl inline-block">
                    Bạn ra <strong>{rpsResult.player}</strong> • Đối thủ ra <strong>{rpsResult.bot}</strong> ➔ {rpsResult.outcome}
                  </div>
                )}
              </div>
            )}

            {/* 4. Đuổi Hình Bắt Chữ & Tục Ngữ Việt Nam */}
            {activeFolkGame === 'proverb' && (
              <div className="bg-slate-800/80 border border-amber-400/30 rounded-2xl p-6 text-center">
                <div className="text-4xl mb-3">{PROVERB_RIDDLES[proverbIndex].icons}</div>
                <p className="text-xs text-slate-300 mb-4">Gợi ý: {PROVERB_RIDDLES[proverbIndex].hint}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-xl mx-auto">
                  {PROVERB_RIDDLES[proverbIndex].options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        if (opt === PROVERB_RIDDLES[proverbIndex].answer) {
                          setCoins((c) => c + 50);
                          setExp((e) => e + 25);
                          soundFX.playHarvest();
                          showToast('🎉 Chính xác! Bạn nhận được +50 Xu & +25 EXP!');
                          setProverbIndex((i) => (i + 1) % PROVERB_RIDDLES.length);
                        } else {
                          showToast('🤔 Chưa đúng rồi, hãy thử đáp án khác nhé!');
                        }
                      }}
                      className="p-3 rounded-xl bg-slate-900 hover:bg-amber-500/20 border border-white/15 text-xs font-bold text-white transition"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Lật Thẻ Ghi Nhớ Hình Ảnh */}
            {activeFolkGame === 'memory' && (
              <div className="bg-slate-800/80 border border-emerald-400/30 rounded-2xl p-5 flex flex-col items-center">
                <div className="grid grid-cols-4 gap-3 max-w-md w-full">
                  {memoryCards.map((card, idx) => (
                    <button
                      key={card.id}
                      onClick={() => handleFlipMemoryCard(idx)}
                      className={`h-20 rounded-2xl border text-3xl flex items-center justify-center transition ${
                        card.flipped || card.matched
                          ? 'bg-emerald-500/25 border-emerald-400'
                          : 'bg-slate-900 border-white/15 hover:bg-slate-800'
                      }`}
                    >
                      {card.flipped || card.matched ? card.symbol : '❓'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Chế độ 4 Người: HÀNH TRÌNH KHÁM PHÁ VĂN HÓA VIỆT NAM */}
            {activeFolkGame === 'cultural_quest' && (
              <div className="bg-slate-800/80 border border-rose-400/40 rounded-2xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-black text-rose-300">
                      🇻🇳 CHẾ ĐỘ 4 NGƯỜI: HÀNH TRÌNH KHÁM PHÁ VĂN HÓA VIỆT NAM
                    </h3>
                    <p className="text-xs text-slate-300">
                      Trả lời câu hỏi văn hóa, lịch sử & 12 con giáp để sưu tầm Bảo Vật Quốc Gia cùng nhóm bạn!
                    </p>
                  </div>
                  <div className="text-xs font-extrabold text-amber-300">
                    Tiến độ nhóm: {groupCulturalProgress}%
                  </div>
                </div>

                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden mb-4 border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 transition-all"
                    style={{ width: `${groupCulturalProgress}%` }}
                  />
                </div>

                <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 mb-4">
                  <div className="text-xs font-bold text-amber-300 mb-1">
                    Câu hỏi #{culturalQuizIndex + 1} (Phần thưởng bảo vật: {CULTURAL_QUESTIONS[culturalQuizIndex].relic}):
                  </div>
                  <div className="text-sm font-extrabold text-white mb-3">
                    {CULTURAL_QUESTIONS[culturalQuizIndex].q}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CULTURAL_QUESTIONS[culturalQuizIndex].options.map((opt, idx) => (
                      <button
                        key={opt}
                        onClick={() => {
                          const qObj = CULTURAL_QUESTIONS[culturalQuizIndex];
                          if (idx === qObj.answer) {
                            setCoins((c) => c + 65);
                            setExp((e) => e + 35);
                            setGroupCulturalProgress((p) => Math.min(100, p + 15));
                            setCollectedRelics((prev) =>
                              prev.includes(qObj.relic) ? prev : [...prev, qObj.relic]
                            );
                            soundFX.playHarvest();
                            showToast(`🏆 Đúng rồi! ${qObj.explain} (+65 Xu & Bảo vật ${qObj.relic})`);
                            setCulturalQuizIndex((i) => (i + 1) % CULTURAL_QUESTIONS.length);
                          } else {
                            showToast('📚 Chưa chính xác, hãy cùng bạn bè suy nghĩ thêm nhé!');
                          }
                        }}
                        className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-500/25 border border-white/10 text-left text-xs font-bold text-white transition"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-xs font-bold text-slate-300 mb-1.5">
                  🏺 Bộ Sưu Tập Bảo Vật Văn Hóa Việt Nam Đã Mở Khóa ({collectedRelics.length}/6):
                </div>
                <div className="flex flex-wrap gap-2">
                  {collectedRelics.map((r) => (
                    <span
                      key={r}
                      className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-bold"
                    >
                      ✨ {r}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: PHÒNG MULTIPLAYER 4 NGƯỜI THỜI GIAN THỰC                    */}
      {/* ==================================================================== */}
      {activePanel === 'multiplayer' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-emerald-400/40 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-black text-emerald-300 flex items-center gap-2">
                  🌐 HỆ THỐNG MULTIPLAYER 4 NGƯỜI CHƠI ONLINE
                </h2>
                <p className="text-xs text-slate-300">
                  Đồng bộ vị trí 3D, hành động, khu vườn, chat và pháo hoa thời gian thực giữa 4 trình duyệt/thiết bị!
                </p>
              </div>
              <button
                onClick={() => setActivePanel(null)}
                className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
              >
                Đóng ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div className="bg-slate-800/80 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400">Mã Phòng Hiện Tại (Tối đa 4 người):</div>
                <div className="text-2xl font-black text-emerald-300 tracking-widest my-1">{roomCode}</div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreateNewRoom}
                    className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs"
                  >
                    + Tạo Phòng Mới
                  </button>
                  <button
                    onClick={() => {
                      window.open(window.location.href, '_blank');
                      showToast('🚀 Đã mở thêm 1 tab người chơi mới để bạn test Multiplayer ngay lập tức!');
                    }}
                    className="flex-1 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 font-bold text-xs"
                  >
                    Mở Tab Thứ 2 Test
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/80 border border-white/10 rounded-2xl p-4">
                <div className="text-xs text-slate-400 mb-1.5">Tham Gia Phòng Của Bạn Bè:</div>
                <input
                  type="text"
                  value={inputRoomCode}
                  onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                  placeholder="Nhập mã phòng (VD: ADIVA1)"
                  className="w-full bg-slate-950 border border-white/15 rounded-xl px-3 py-2 text-xs font-bold text-white uppercase mb-2"
                />
                <button
                  onClick={handleJoinRoom}
                  className="w-full py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs"
                >
                  Kết Nối Vào Phòng
                </button>
              </div>
            </div>

            <div className="text-xs font-bold text-slate-300 mb-2">
              Danh sách người chơi trực tuyến trong phòng ({onlinePlayersCount}/4):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Bản thân */}
              <div className="bg-emerald-950/60 border border-emerald-400/40 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold text-white">{playerName} (Bạn)</div>
                  <div className="text-[11px] text-emerald-300">{currentZodiac.zodiac}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  Trực tuyến
                </span>
              </div>

              {/* Bạn bè trong phòng */}
              {Object.values(remotePlayers).map((rp) => (
                <div
                  key={rp.id}
                  className="bg-slate-800/90 border border-sky-400/40 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-extrabold text-white">{rp.name}</div>
                    <div className="text-[11px] text-sky-300">
                      Tọa độ: ({Math.round(rp.x || 0)}, {Math.round(rp.z || 0)})
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      playerStateRef.current.x = (rp.x || 0) + 1.8;
                      playerStateRef.current.z = (rp.z || 0) + 1.8;
                      setActivePanel(null);
                      showToast(`🧭 Đã dịch chuyển đến cạnh ${rp.name}!`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 text-[11px] font-black"
                  >
                    Đến Cạnh Bạn
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: CHỌN 12 CON GIÁP, PHỤ KIỆN TRANG PHỤC & 6 PET FANTASY       */}
      {/* ==================================================================== */}
      {activePanel === 'character' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl bg-slate-900 border border-pink-400/40 rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-black text-pink-300">
                  ✨ HỆ THỐNG 12 NHÂN VẬT CON GIÁP 3D, PHỤ KIỆN & PET ĐỒNG HÀNH
                </h2>
                <p className="text-xs text-slate-300">
                  Mỗi con giáp có tai, sừng, cánh năng lượng, đuôi và biểu cảm 3D riêng biệt!
                </p>
              </div>
              <button
                onClick={() => setActivePanel(null)}
                className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
              >
                Xác Nhận ✕
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-slate-300">Tên Nhân Vật:</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="bg-slate-950 border border-white/20 rounded-xl px-3 py-1.5 text-xs font-bold text-white"
              />
              <button
                onClick={() => {
                  cameraControlRef.current.theta += Math.PI / 2;
                  showToast('🔄 Đã xoay mô hình 3D góc 90 độ!');
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-500/20 border border-sky-400/40 text-sky-200 text-xs font-bold"
              >
                🔄 Xoay Xem 360°
              </button>
            </div>

            {/* Lưới 12 Con Giáp */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
              {ZODIAC_CHARACTERS.map((z, idx) => (
                <button
                  key={z.id}
                  onClick={() => {
                    soundFX.playClick();
                    setSelectedZodiacIndex(idx);
                  }}
                  className={`p-3 rounded-2xl border text-left transition ${
                    selectedZodiacIndex === idx
                      ? 'bg-pink-500/25 border-pink-400 shadow-lg'
                      : 'bg-slate-800/80 border-white/10 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: z.primaryColor }}
                    />
                    <span className="text-xs font-extrabold text-white truncate">{z.zodiac}</span>
                  </div>
                  <div className="text-[10px] text-amber-300 font-semibold mt-0.5">{z.title}</div>
                  <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">{z.description}</p>
                </button>
              ))}
            </div>

            {/* Chọn Phụ Kiện 3D & 6 Pet Đồng Hành */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/70 border border-white/10 rounded-2xl p-3.5">
                <div className="text-xs font-bold text-amber-300 mb-2">👑 Phụ Kiện Trang Phục 3D:</div>
                <div className="flex flex-wrap gap-2">
                  {CHARACTER_ACCESSORIES.map((acc) => {
                    const owned = unlockedAccessories.includes(acc.id);
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          if (owned) {
                            setSelectedAccessory(acc.id);
                            soundFX.playClick();
                          } else if (coins >= acc.price) {
                            setCoins((c) => c - acc.price);
                            setUnlockedAccessories((prev) => [...prev, acc.id]);
                            setSelectedAccessory(acc.id);
                            soundFX.playHarvest();
                            showToast(`🎉 Đã mở khóa và trang bị: ${acc.name}!`);
                          } else {
                            showToast(`⚠️ Cần ${acc.price} Xu để mở khóa ${acc.name}!`);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                          selectedAccessory === acc.id
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-slate-900 text-slate-200 border-white/10'
                        }`}
                      >
                        {acc.name} {!owned && `(${acc.price} Xu)`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-800/70 border border-white/10 rounded-2xl p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-sky-300">🦋 6 Sinh Vật Đồng Hành (Pet Lv.{petLevel}):</span>
                  <button
                    onClick={() => {
                      if (coins < 100) {
                        showToast('⚠️ Cần 100 Xu để nâng cấp Pet!');
                        return;
                      }
                      setCoins((c) => c - 100);
                      setPetLevel((l) => l + 1);
                      soundFX.playHarvest();
                      showToast(`✨ Đã nâng cấp ${currentPet.name} lên Cấp ${petLevel + 1}!`);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 text-[10px] font-black"
                  >
                    + Nâng Cấp Pet (100 Xu)
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PET_COMPANIONS.map((pet, idx) => (
                    <button
                      key={pet.id}
                      onClick={() => {
                        setSelectedPetIndex(idx);
                        soundFX.playClick();
                      }}
                      className={`p-2 rounded-xl border text-left text-xs font-bold ${
                        selectedPetIndex === idx
                          ? 'bg-sky-500/25 border-sky-400 text-white'
                          : 'bg-slate-900 border-white/10 text-slate-300'
                      }`}
                    >
                      🐾 {pet.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 6: 15 BIỂU CẢM & TƯƠNG TÁC BẠN BÈ                              */}
      {/* ==================================================================== */}
      {activePanel === 'emotes' && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-xl bg-slate-900/95 backdrop-blur-2xl border border-amber-400/40 rounded-3xl p-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-amber-300">
              💃 15 HÀNH ĐỘNG & TƯƠNG TÁC CÙNG BẠN BÈ
            </span>
            <button onClick={() => setActivePanel(null)} className="text-xs text-slate-400 hover:text-white">
              Đóng ✕
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {SOCIAL_EMOTES.map((em) => (
              <button
                key={em.id}
                onClick={() => triggerEmoteAction(em)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-amber-500/25 border border-white/10 flex flex-col items-center gap-1 transition"
              >
                <span className="text-xl">{em.emoji}</span>
                <span className="text-[10px] font-bold text-slate-200 text-center">{em.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 7: ĐỔI MÀU CÂY CỐI & HOA ĐÀO THỜI GIAN THỰC                    */}
      {/* ==================================================================== */}
      {activePanel === 'color' && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-md bg-slate-900/95 backdrop-blur-2xl border border-sky-400/40 rounded-3xl p-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black text-sky-300">🎨 TÙY CHỈNH MÀU SẮC THIÊN NHIÊN CÔNG VIÊN</span>
            <button
              onClick={() => setNatureColors(DEFAULT_NATURE_COLORS)}
              className="text-[11px] text-amber-300 underline"
            >
              Mặc định
            </button>
          </div>
          <div className="space-y-2.5 text-xs">
            {[
              { key: 'sakuraColor', label: '🌸 Màu Cây Hoa Anh Đào' },
              { key: 'treeFoliageColor', label: '🌲 Màu Tán Cây Xanh' },
              { key: 'flowerBedColor', label: '🌺 Màu Thảm Hoa Công Viên' },
              { key: 'waterTint', label: '💧 Màu Nước Suối & Hồ Cá Koi' }
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between bg-slate-800/80 px-3 py-2 rounded-xl">
                <span>{item.label}</span>
                <input
                  type="color"
                  value={natureColors[item.key]}
                  onChange={(e) => setNatureColors((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  className="w-8 h-7 rounded cursor-pointer bg-transparent"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 8: BẢN ĐỒ LỚN TOÀN THẾ GIỚI MỞ & DỊCH CHUYỂN NHANH             */}
      {/* ==================================================================== */}
      {activePanel === 'map' && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-sky-400/40 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h2 className="text-lg font-black text-sky-300 flex items-center gap-2">
                🗺️ BẢN ĐỒ TỔNG QUAN CÔNG VIÊN ADIVA CHIBI WORLD
              </h2>
              <button
                onClick={() => setActivePanel(null)}
                className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold"
              >
                Đóng ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {WORLD_LANDMARKS.map((lm) => (
                <button
                  key={lm.id}
                  onClick={() => {
                    teleportToLandmark(lm);
                    setActivePanel(null);
                  }}
                  className="p-3.5 rounded-2xl bg-slate-800/80 hover:bg-sky-500/20 border border-white/10 text-left transition flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lm.color }} />
                      {lm.name}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{lm.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-sky-300 shrink-0">
                    ({lm.x}, {lm.z})
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MÀN HÌNH CHÀO MỪNG BAN ĐẦU (LOGO ADIVA CHIBI WORLD)                  */}
      {/* ==================================================================== */}
      {/* MÀN HÌNH CHÀO MỪNG BAN ĐẦU (CÓ PREVIEW NHÂN VẬT & PET 3D TRỰC TIẾP)   */}
      {/* ==================================================================== */}
      {/* MÀN HÌNH ĐẦU TIÊN: PHÒNG CHỌN NHÂN VẬT & PET 3D CÓ PREVIEW TRỰC TIẾP */}
      {/* ==================================================================== */}
      {showWelcomeHero && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5">
          <div className="w-full max-w-6xl bg-slate-900/95 border-2 border-sky-400/50 rounded-3xl p-4 sm:p-6 shadow-2xl max-h-[94vh] overflow-y-auto">
            {/* Tiêu đề trang đầu */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[11px] font-extrabold">
                  ✦ THẾ GIỚI MỞ 3D MULTIPLAYER 4 NGƯỜI ✦
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-sky-300 via-pink-300 to-amber-300 bg-clip-text text-transparent mt-0.5">
                  ADIVA CHIBI WORLD – PHÒNG CHỌN NHÂN VẬT & PET 3D
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-slate-800/90 border border-emerald-400/40 rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-slate-400 mr-1">Mã Phòng 4 Người:</span>
                  <span className="font-black text-emerald-300">{roomCode}</span>
                </div>
                <button
                  onClick={() => {
                    soundFX.init();
                    soundFX.playEmote();
                    setShowWelcomeHero(false);
                    showToast(`🎉 Chào mừng ${playerName} (${currentZodiac.zodiac}) & ${currentPet.name} vào thế giới!`);
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-sky-400 via-pink-400 to-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl hover:scale-105 transition"
                >
                  🚀 Xác Nhận & Vào Thế Giới Ngay
                </button>
              </div>
            </div>

            {/* Bố cục 2 Cột: Cột Trái là Studio Preview 3D Trực Tiếp • Cột Phải là Bảng Chọn 12 Con Giáp, 6 Pet Cấp S & Phụ Kiện */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* CỘT TRÁI (5 PHẦN): KHUNG PREVIEW 3D NHÂN VẬT & PET TRỰC TIẾP */}
              <div className="lg:col-span-5 bg-slate-950/80 border border-white/15 rounded-2xl p-3.5 flex flex-col gap-3">
                <CharacterStudioPreview
                  zodiacConfig={currentZodiac}
                  petConfig={currentPet}
                  accessoryId={selectedAccessory}
                  playerName={playerName}
                  previewAnim={previewAnimMode}
                  focusTarget={previewFocusTarget}
                />

                {/* Chọn góc Camera Preview (Toàn thân / Cận mặt / Cận cảnh Pet 3D) */}
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'full', label: '📷 Nhân Vật & Pet' },
                    { id: 'face', label: '😊 Cận Khuôn Mặt' },
                    { id: 'pet', label: '🦋 Cận Cảnh Pet 3D' }
                  ].map((camBtn) => (
                    <button
                      key={camBtn.id}
                      onClick={() => {
                        soundFX.playClick();
                        setPreviewFocusTarget(camBtn.id);
                      }}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition ${
                        previewFocusTarget === camBtn.id
                          ? 'bg-sky-400 text-slate-950 font-black shadow'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {camBtn.label}
                    </button>
                  ))}
                </div>

                {/* Nút Xem Trước Hoạt Ảnh (Animation Preview) */}
                <div>
                  <div className="text-[11px] font-bold text-slate-400 mb-1.5">
                    🎬 Xem trước hoạt ảnh 3D của nhân vật & Pet:
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { id: 'idle', label: 'Đứng Nghỉ' },
                      { id: 'walk', label: 'Đi Bộ' },
                      { id: 'jump', label: 'Nhảy Vui' },
                      { id: 'wave', label: 'Vẫy Tay' },
                      { id: 'dance', label: 'Nhảy Múa' }
                    ].map((anim) => (
                      <button
                        key={anim.id}
                        onClick={() => {
                          soundFX.playClick();
                          setPreviewAnimMode(anim.id);
                        }}
                        className={`py-1.5 rounded-lg text-[10px] font-extrabold transition ${
                          previewAnimMode === anim.id
                            ? 'bg-pink-500 text-white shadow'
                            : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {anim.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thông tin tóm tắt Nhân vật & Pet đang hiển thị */}
                <div className="bg-slate-900 border border-white/10 rounded-xl p-3 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-amber-300">{currentZodiac.zodiac}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold">
                      Tốc độ x{currentZodiac.speedBonus}
                    </span>
                  </div>
                  <div className="text-xs text-pink-300 font-semibold mt-0.5">{currentZodiac.title}</div>
                  <p className="text-[11px] text-slate-300 mt-1">{currentZodiac.description}</p>
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                    <span className="text-emerald-300 font-bold">🐾 Pet: {currentPet.name}</span>
                    <span className="text-[10px] text-slate-400">Hào quang phát sáng ban đêm</span>
                  </div>
                </div>
              </div>

              {/* CỘT PHẢI (7 PHẦN): ĐẶT TÊN, CHỌN 12 CON GIÁP, 6 PET 3D CẤP CAO & PHỤ KIỆN */}
              <div className="lg:col-span-7 flex flex-col gap-4 text-left">
                {/* 1. Đặt tên Nhân vật & Mã phòng */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-800/70 border border-white/10 rounded-2xl p-3.5">
                  <div>
                    <label className="text-[11px] font-bold text-sky-300 block mb-1">
                      👤 Tên Nhân Vật Của Bạn:
                    </label>
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Nhập tên nhân vật..."
                      className="w-full bg-slate-950 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-emerald-300 block mb-1">
                      🌐 Mã Phòng Chơi Cùng Bạn Bè (4 Người):
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={inputRoomCode}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setInputRoomCode(val);
                          if (val.trim()) setRoomCode(val.trim());
                        }}
                        className="flex-1 bg-slate-950 border border-white/20 rounded-xl px-3 py-2 text-xs font-bold text-emerald-300 uppercase"
                      />
                      <button
                        onClick={handleCreateNewRoom}
                        className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0"
                      >
                        Tạo Mã Mới
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Chọn 12 Nhân Vật Con Giáp 3D */}
                <div className="bg-slate-800/70 border border-pink-400/30 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-pink-300">
                      🌟 1. CHỌN 1 TRONG 12 NHÂN VẬT CON GIÁP CHIBI 3D:
                    </span>
                    <span className="text-[11px] text-slate-400">Bấm để đổi mô hình 3D ngay lập tức</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                    {ZODIAC_CHARACTERS.map((z, idx) => (
                      <button
                        key={z.id}
                        onClick={() => {
                          soundFX.playClick();
                          setSelectedZodiacIndex(idx);
                          if (previewFocusTarget === 'pet') setPreviewFocusTarget('full');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          selectedZodiacIndex === idx
                            ? 'bg-pink-500/30 border-pink-400 text-white shadow-lg ring-1 ring-pink-300'
                            : 'bg-slate-900/85 border-white/10 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/40"
                            style={{ backgroundColor: z.primaryColor }}
                          />
                          <span className="text-xs font-extrabold truncate">{z.zodiac}</span>
                        </div>
                        <div className="text-[10px] text-amber-300 font-semibold mt-1 truncate">{z.title}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Chọn 6 Pet Đồng Hành 3D Cấp Cao */}
                <div className="bg-slate-800/70 border border-sky-400/30 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-sky-300">
                      🦋 2. CHỌN PET LINH THÚ 3D CẤP CAO BAY THEO BÊN CẠNH:
                    </span>
                    <button
                      onClick={() => setPreviewFocusTarget(previewFocusTarget === 'pet' ? 'full' : 'pet')}
                      className="text-[11px] text-amber-300 underline font-bold"
                    >
                      {previewFocusTarget === 'pet' ? 'Xem Toàn Thân' : '🔍 Phóng To Xem Pet 3D'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {PET_COMPANIONS.map((pet, idx) => (
                      <button
                        key={pet.id}
                        onClick={() => {
                          soundFX.playClick();
                          setSelectedPetIndex(idx);
                          setPreviewFocusTarget('pet');
                        }}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          selectedPetIndex === idx
                            ? 'bg-sky-500/30 border-sky-400 text-white shadow-lg ring-1 ring-sky-300'
                            : 'bg-slate-900/85 border-white/10 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: pet.color }}
                          />
                          <span className="text-xs font-extrabold truncate">{pet.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">{pet.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Chọn Phụ Kiện Trang Phục 3D & Nút Vào Thế Giới */}
                <div className="bg-slate-800/70 border border-amber-400/30 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black text-amber-300 mb-1.5">
                      👑 3. CHỌN PHỤ KIỆN TRANG PHỤC 3D:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CHARACTER_ACCESSORIES.map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => {
                            soundFX.playClick();
                            setSelectedAccessory(acc.id);
                            if (!unlockedAccessories.includes(acc.id)) {
                              setUnlockedAccessories((prev) => [...prev, acc.id]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            selectedAccessory === acc.id
                              ? 'bg-amber-400 text-slate-950 border-amber-300 font-black'
                              : 'bg-slate-900 text-slate-200 border-white/10 hover:bg-slate-800'
                          }`}
                        >
                          {acc.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      soundFX.init();
                      soundFX.playEmote();
                      setShowWelcomeHero(false);
                      showToast(`🎉 Chào mừng ${playerName} (${currentZodiac.zodiac}) bước vào ADIVA CHIBI WORLD!`);
                    }}
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-gradient-to-r from-sky-400 via-pink-400 to-amber-400 text-slate-950 font-black text-sm shadow-2xl hover:scale-105 transition"
                  >
                    🚀 Bắt Đầu Khám Phá Thế Giới Mở
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}