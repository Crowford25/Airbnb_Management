export type Locale = "en" | "zh-CN";
export type StayType = "airbnb" | "hotel";

export type AmenityId =
  | "airConditioning"
  | "cityView"
  | "fullKitchen"
  | "infinityPool"
  | "parking"
  | "privateCourtyard"
  | "seaView"
  | "washerDryer"
  | "wifi";

type PropertyLocalizedContent = {
  tagline: string;
  description: string;
  galleryLabels: [string, string, string, string];
};

export type CustomerRatePlan = {
  rateKey: string;
  name: string;
  nameZhCn: string | null;
  currency: string;
  nightlyRate: number;
  minimumNights: number;
  isDefault: boolean;
  cancellationPolicyName: string | null;
  inventory: Record<
    string,
    {
      remainingUnits: number;
      nightlyRate: number;
      minimumNights: number;
      closedToArrival: boolean;
      closedToDeparture: boolean;
    }
  >;
};

export type RoomOption = {
  roomKey: string;
  name: string;
  nameZhCn: string | null;
  maxAdults: number;
  maxChildren: number;
  maxGuests: number;
  inventoryCount: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  ratePlans: CustomerRatePlan[];
};

export type Property = {
  slug: string;
  name: string;
  stayType: StayType;
  location: "Kuala Lumpur" | "Penang" | "Langkawi";
  guests: number;
  bedrooms: number;
  bathrooms: number;
  nightlyRate: number;
  minimumNights: number;
  rating: number;
  reviewCount: number;
  gradient: string;
  galleryImages: [string, string, string, string];
  amenities: AmenityId[];
  rooms: RoomOption[];
  localized: Record<Locale, PropertyLocalizedContent>;
};

export const properties = [
  {
    slug: "the-opaline-residence",
    name: "The Opaline Residence",
    stayType: "hotel",
    location: "Kuala Lumpur",
    rating: 4.94,
    reviewCount: 128,
    gradient:
      "radial-gradient(circle at 68% 24%, rgba(218,190,127,.72), transparent 18%), linear-gradient(135deg, #1c1a17 0%, #6e604b 48%, #131313 100%)",
    galleryImages: [
      "/properties/the-opaline-residence-1.png",
      "/properties/the-opaline-residence-2.png",
      "/properties/the-opaline-residence-3.png",
      "/properties/the-opaline-residence-4.png",
    ],
    amenities: [
      "cityView",
      "wifi",
      "fullKitchen",
      "airConditioning",
      "washerDryer",
      "parking",
    ],
    localized: {
      en: {
        tagline: "Skyline calm in the heart of Kuala Lumpur.",
        description:
          "A light-filled high-rise residence shaped for unhurried city stays. Double-height living spaces, warm natural materials, and a private balcony frame uninterrupted skyline views.",
        galleryLabels: [
          "Double-height living room with Kuala Lumpur skyline",
          "Dark-stone kitchen and dining room",
          "Primary bedroom with city view",
          "Private balcony at blue hour",
        ],
      },
      "zh-CN": {
        tagline: "于吉隆坡中心，静享云端天际线。",
        description:
          "这间采光充沛的高层居所专为从容的城市旅居而设。挑高客厅、温润天然材质与私人阳台，共同勾勒出开阔的天际线景致。",
        galleryLabels: [
          "俯瞰吉隆坡天际线的挑高客厅",
          "深色石材厨房与餐厅",
          "拥有城市景观的主卧室",
          "蓝调时刻的私人阳台",
        ],
      },
    },
  },
  {
    slug: "the-atlas-villa",
    name: "The Atlas Villa",
    stayType: "airbnb",
    location: "Langkawi",
    rating: 4.98,
    reviewCount: 86,
    gradient:
      "radial-gradient(circle at 22% 20%, rgba(209,178,115,.55), transparent 20%), linear-gradient(145deg, #4d4c43 0%, #1e302b 46%, #0f1513 100%)",
    galleryImages: [
      "/properties/the-atlas-villa-1.png",
      "/properties/the-atlas-villa-2.png",
      "/properties/the-atlas-villa-3.png",
      "/properties/the-atlas-villa-4.png",
    ],
    amenities: [
      "infinityPool",
      "seaView",
      "wifi",
      "fullKitchen",
      "airConditioning",
      "parking",
    ],
    localized: {
      en: {
        tagline: "A private tropical horizon above the Andaman Sea.",
        description:
          "An indoor-outdoor hillside villa where deep teak, pale limestone, and tropical gardens meet the sea. Open pavilions and an infinity pool make room for slow, restorative days.",
        galleryLabels: [
          "Open-air living pavilion",
          "Infinity pool overlooking the Andaman Sea",
          "Primary bedroom opening to tropical greenery",
          "Sheltered dining terrace at dusk",
        ],
      },
      "zh-CN": {
        tagline: "凌驾安达曼海之上，独享热带天际。",
        description:
          "这座山坡别墅将深色柚木、浅色石材与热带花园融入海景之中。开放式亭阁与无边泳池，为悠缓而疗愈的假期留足空间。",
        galleryLabels: [
          "通透的开放式客厅亭阁",
          "俯瞰安达曼海的无边泳池",
          "面向热带绿意的主卧室",
          "黄昏时分的有顶餐饮露台",
        ],
      },
    },
  },
  {
    slug: "the-terrace-house",
    name: "The Terrace House",
    stayType: "airbnb",
    location: "Penang",
    rating: 4.91,
    reviewCount: 164,
    gradient:
      "radial-gradient(circle at 70% 18%, rgba(226,192,125,.63), transparent 19%), linear-gradient(135deg, #522e27 0%, #9a7355 45%, #211918 100%)",
    galleryImages: [
      "/properties/the-terrace-house-1.png",
      "/properties/the-terrace-house-2.png",
      "/properties/the-terrace-house-3.png",
      "/properties/the-terrace-house-4.png",
    ],
    amenities: [
      "privateCourtyard",
      "wifi",
      "fullKitchen",
      "airConditioning",
      "washerDryer",
      "parking",
    ],
    localized: {
      en: {
        tagline: "Heritage character, quietly reimagined in George Town.",
        description:
          "A restored terrace house that keeps its limewashed walls, timber shutters, and patterned tiles while introducing a calm contemporary rhythm around a planted inner courtyard.",
        galleryLabels: [
          "Courtyard living room",
          "Patterned-tile kitchen and dining space",
          "Bedroom with restored timber shutters",
          "Planted inner courtyard at golden hour",
        ],
      },
      "zh-CN": {
        tagline: "在乔治市，静静重塑南洋老宅风华。",
        description:
          "这座修复后的排屋保留了石灰粉墙、木百叶窗与花砖，并围绕绿意盎然的内院，注入从容而当代的生活节奏。",
        galleryLabels: [
          "围绕内院而设的客厅",
          "铺设花砖的厨房与餐区",
          "保留木百叶窗的卧室",
          "金色时刻的绿植内院",
        ],
      },
    },
  },
];

export const copy = {
  en: {
    nav: { stays: "Stays", collection: "Collection", about: "Our story" },
    hero: {
      eyebrow: "The art of considered stays",
      title: "Find the space that feels like yours.",
      description:
        "A hand-selected collection of private residences in Malaysia's most compelling destinations.",
      explore: "Explore residences",
      collectionNote: "Aureum Collection · Malaysia",
    },
    search: {
      destination: "Where",
      destinationPlaceholder: "Choose a destination",
      stayType: "Stay type",
      allStayTypes: "All stay types",
      hotel: "Hotel",
      airbnb: "Airbnb",
      checkIn: "Check in",
      checkOut: "Check out",
      roomType: "Room",
      guests: "Adults",
      guestOptions: [
        "1 adult",
        "2 adults",
        "3 adults",
        "4 adults",
        "5 adults",
        "6 adults",
        "7 adults",
        "8 adults",
      ],
      submit: "Find a stay",
    },
    collection: {
      eyebrow: "Aureum collection",
      title: "Residences with a point of view.",
      description:
        "Every residence is chosen for its sense of place, considered detail, and room to live beautifully.",
      viewAll: "View all residences",
      nightly: "from RM {rate} / night",
      nightlyHome: "from RM {rate} / home / night",
      nightlyRoom: "from RM {rate} / room / night",
    },
    filters: {
      all: "All stays",
      "Kuala Lumpur": "Kuala Lumpur",
      Penang: "Penang",
      Langkawi: "Langkawi",
      title: "Find your next retreat",
      description: "Browse our private residences across Malaysia.",
      hotel: "Hotels",
      airbnb: "Airbnb homes",
      noResults: "No stays match these dates, adults, and filters.",
      countOne: "{count} residence",
      count: "{count} residences",
    },
    details: {
      guests: "guests",
      bedrooms: "bedrooms",
      bathrooms: "baths",
      rooms: "rooms",
      hotelCapacity: "2 adults per room",
      upToGuests: "Up to {count} people",
    },
    property: {
      backToStays: "Back to all stays",
      about: "About this residence",
      amenities: "What this place offers",
      availability: "Availability",
      calendarHint: "Select your arrival and departure dates.",
      available: "Available",
      unavailable: "Unavailable",
      checkoutOnly: "Checkout only",
      selected: "Selected",
      previousMonth: "Previous month",
      nextMonth: "Next month",
      bookingTitle: "Plan your stay",
      bookingSubtitle: "Choose dates and adults to see the full price.",
      roomType: "Room",
      checkIn: "Check in",
      checkOut: "Check out",
      guests: "Adults",
      guestSingular: "adult",
      guestPlural: "adults",
      roomSingular: "room",
      roomPlural: "rooms",
      hotelRoomRule: "{adults} adults per room · {count} {rooms} selected",
      airbnbCapacity: "Entire home · up to {count} people",
      night: "night",
      nights: "nights",
      cleaningFee: "Cleaning fee",
      serviceFee: "Service fee",
      feesAndTaxes: "Taxes and mandatory fees",
      calculatedAtReview: "Calculated securely",
      accommodation: "Accommodation",
      total: "Total",
      selectDates: "Select dates to see your total.",
      minimumStay: "Minimum stay: {count} night",
      invalidStay: "Choose at least {count} nights.",
      unavailableRange: "Your selected dates include an unavailable night.",
      continueToReview: "Continue to review",
      reviewReady: "Stay ready to review",
      reviewMessage:
        "Your dates and price are ready. Reservation confirmation comes in a later phase.",
      noPayment: "You will not be charged. Payments are not included yet.",
      gallery: "Property gallery",
      rating: "{rating} rating from {count} reviews",
      sleeps: "Sleeps {count}",
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    },
    amenities: {
      airConditioning: "Air conditioning",
      cityView: "City skyline view",
      fullKitchen: "Full kitchen",
      infinityPool: "Private infinity pool",
      parking: "Private parking",
      privateCourtyard: "Private courtyard",
      seaView: "Sea view",
      washerDryer: "Washer and dryer",
      wifi: "High-speed Wi-Fi",
    },
    auth: { signIn: "Sign in", signOut: "Sign out", signingOut: "Signing out…" },
    accessibility: {
      changeLanguage: "Switch to Simplified Chinese",
      email: "Email Aureum Stays",
      collection: "View the Aureum Stays collection",
      location: "Malaysia",
      filters: "Filter residences by destination",
      results: "Residence results",
    },
    values: [
      ["Private by design", "Spaces that feel entirely your own."],
      ["Thoughtful hosting", "A refined stay, from arrival onward."],
      ["Local in spirit", "Distinctive places in exceptional settings."],
    ],
    footer: "Aureum Stays · Private residences, beautifully considered.",
  },
  "zh-CN": {
    nav: { stays: "住宿", collection: "精选居所", about: "品牌故事" },
    hero: {
      eyebrow: "悉心雕琢的居住艺术",
      title: "寻找真正属于您的理想空间。",
      description: "精选马来西亚最具魅力目的地的私人居所，为您呈现不凡旅居体验。",
      explore: "探索居所",
      collectionNote: "Aureum 精选 · 马来西亚",
    },
    search: {
      destination: "目的地",
      destinationPlaceholder: "选择目的地",
      stayType: "住宿类型",
      allStayTypes: "全部住宿类型",
      hotel: "酒店",
      airbnb: "Airbnb 民宿",
      checkIn: "入住日期",
      checkOut: "退房日期",
      roomType: "客房",
      guests: "成人",
      guestOptions: [
        "1 位成人",
        "2 位成人",
        "3 位成人",
        "4 位成人",
        "5 位成人",
        "6 位成人",
        "7 位成人",
        "8 位成人",
      ],
      submit: "寻找住宿",
    },
    collection: {
      eyebrow: "Aureum 精选",
      title: "每一处居所，都有独到见解。",
      description: "我们因独特的场所感、细致的设计和舒适的生活空间而挑选每一处居所。",
      viewAll: "查看全部居所",
      nightly: "每晚 RM {rate} 起",
      nightlyHome: "整套房源每晚 RM {rate} 起",
      nightlyRoom: "每间客房每晚 RM {rate} 起",
    },
    filters: {
      all: "全部住宿",
      "Kuala Lumpur": "吉隆坡",
      Penang: "槟城",
      Langkawi: "兰卡威",
      title: "寻找您的下一处度假居所",
      description: "浏览我们遍布马来西亚的私人居所。",
      hotel: "酒店",
      airbnb: "Airbnb 民宿",
      noResults: "没有符合这些日期、成人数量和筛选条件的住宿。",
      countOne: "{count} 处居所",
      count: "{count} 处居所",
    },
    details: {
      guests: "位住客",
      bedrooms: "间卧室",
      bathrooms: "间浴室",
      rooms: "间客房",
      hotelCapacity: "每间客房 2 位成人",
      upToGuests: "最多入住 {count} 人",
    },
    property: {
      backToStays: "返回全部居所",
      about: "关于这处居所",
      amenities: "居所设施",
      availability: "可订日期",
      calendarHint: "请选择入住与退房日期。",
      available: "可订",
      unavailable: "不可订",
      checkoutOnly: "仅可退房",
      selected: "已选择",
      previousMonth: "上个月",
      nextMonth: "下个月",
      bookingTitle: "规划您的旅程",
      bookingSubtitle: "选择日期与成人数量，即可查看完整价格。",
      roomType: "客房",
      checkIn: "入住日期",
      checkOut: "退房日期",
      guests: "成人",
      guestSingular: "位成人",
      guestPlural: "位成人",
      roomSingular: "间客房",
      roomPlural: "间客房",
      hotelRoomRule: "每间客房 {adults} 位成人 · 已选择 {count} {rooms}",
      airbnbCapacity: "整套房源 · 最多入住 {count} 人",
      night: "晚",
      nights: "晚",
      cleaningFee: "清洁费",
      serviceFee: "服务费",
      feesAndTaxes: "税费及必要费用",
      calculatedAtReview: "由服务器安全计算",
      accommodation: "住宿费",
      total: "总计",
      selectDates: "选择日期后即可查看总价。",
      minimumStay: "至少入住 {count} 晚",
      invalidStay: "请选择至少 {count} 晚。",
      unavailableRange: "您选择的日期中包含不可订的晚上。",
      continueToReview: "继续查看",
      reviewReady: "旅程信息已可查看",
      reviewMessage: "您的日期与价格已准备好。预订确认将在后续阶段开放。",
      noPayment: "您不会被收费，付款功能尚未开放。",
      gallery: "居所图片",
      rating: "{rating} 分，来自 {count} 条评价",
      sleeps: "最多入住 {count} 位住客",
      weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    },
    amenities: {
      airConditioning: "空调",
      cityView: "城市天际线景观",
      fullKitchen: "完整厨房",
      infinityPool: "私人无边泳池",
      parking: "私人停车位",
      privateCourtyard: "私人内院",
      seaView: "海景",
      washerDryer: "洗衣机与烘干机",
      wifi: "高速 Wi-Fi",
    },
    auth: { signIn: "登录", signOut: "退出登录", signingOut: "正在退出…" },
    accessibility: {
      changeLanguage: "切换至英文",
      email: "发送电子邮件给 Aureum Stays",
      collection: "查看 Aureum Stays 精选居所",
      location: "马来西亚",
      filters: "按目的地筛选居所",
      results: "居所搜索结果",
    },
    values: [
      ["私密而生", "让每一处空间真正属于您。"],
      ["细腻待客", "从抵达开始，享受精致体验。"],
      ["在地灵感", "于非凡场景中，感受独特居所。"],
    ],
    footer: "Aureum Stays · 精心甄选的私人居所。",
  },
} as const;
