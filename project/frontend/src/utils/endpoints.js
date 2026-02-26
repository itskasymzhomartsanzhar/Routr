
export default {
  app: {
    bootstrap: "/api/bootstrap/",
  },
  auth: {
    telegram: "/api/auth/telegram/",
    refresh: "/api/auth/token/refresh/",
    me: "/api/auth/me/",
    update: "/api/auth/me/update/",
  },
  products: {
    available: "/api/products/available/",
  },
  payments: {
    robokassaCreate: "/api/payments/robokassa/create/",
    robokassaSendMessage: "/api/payments/robokassa/send-message/",
  },
  habits: {
    list: "/api/habits/",
    detail: (id) => `/api/habits/${id}/`,
    create: "/api/habits/",
    update: (id) => `/api/habits/${id}/`,
    delete: (id) => `/api/habits/${id}/`,
    complete: (id) => `/api/habits/${id}/complete/`,
    share: (id) => `/api/habits/${id}/share/`,
    participants: (id) => `/api/habits/${id}/participants/`,
    participantStats: (id) => `/api/habits/${id}/participant-stats/`,
    copy: "/api/habits/copy/",
    publicHabits: "/api/habits/public/",
    stats: "/api/habits/stats/",
    balance: "/api/habits/balance/",
  },
  categories: {
    list: "/api/categories/",
  },
  xp: {
    progress: "/api/xp/progress/",
    quests: "/api/xp/quests/",
    titles: "/api/xp/titles/",
    leaderboard: "/api/xp/leaderboard/",
  },
  users: {
    publicProfile: (id) => `/api/users/${id}/public-profile/`,
  },


};
