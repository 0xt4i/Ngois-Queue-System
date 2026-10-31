"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "vi" | "en";

const translations = {
  vi: {
    live: "Đang cập nhật trực tiếp",
    disconnected: "Mất kết nối trực tiếp, đang thử lại",
    updatedAt: "Cập nhật lúc",
    serving: "Đang chụp",
    waiting: "Đang chờ",
    pausedTitle: "Tiệm tạm ngưng nhận số",
    pausedText: "Bạn vui lòng quay lại sau ít phút, hoặc hỏi nhân viên tại quầy nhé.",
    takeTicket: "Lấy số thứ tự",
    codeHint: "Nhập mã ngày đang hiện trên màn hình tại quầy.",
    codeAutoHint: "Mã ngày đã được điền tự động. Bạn chỉ cần nhập tên.",
    dailyCode: "Mã ngày (4 số)",
    yourName: "Tên của bạn",
    namePlaceholder: "VD: Ngọc Anh",
    getTicket: "Nhận số",
    checkingTicket: "Đang kiểm tra số của bạn…",
    staffLogin: "Đăng nhập nhân viên",
    username: "Tên đăng nhập",
    password: "Mật khẩu",
    login: "Đăng nhập",
    staff: "Nhân viên",
    owner: "Chủ tiệm",
    shopDisplay: "Màn hình tiệm",
    customerPage: "Trang khách",
    settings: "Cài đặt",
    logout: "Đăng xuất",
    next: "NEXT",
    absent: "VẮNG MẶT",
    undo: "HOÀN TÁC",
    currentCode: "Mã ngày hiện tại",
    today: "Hôm nay",
    waitingList: "Danh sách chờ",
    noWaiting: "Chưa có khách nào đang chờ.",
    missed: "Đã gọi lỡ",
    none: "Không có.",
    recentlyDone: "Vừa chụp xong",
    noRecent: "Chưa có.",
    recall: "Gọi lại",
    manual: "Thủ công",
    shortcuts: "Phím tắt",
    language: "Ngôn ngữ",
    manageQueue: "Quản lý hàng đợi của tiệm",
  },
  en: {
    live: "Live updates",
    disconnected: "Live connection lost, retrying",
    updatedAt: "Updated at",
    serving: "Now serving",
    waiting: "Waiting",
    pausedTitle: "Ticket intake is paused",
    pausedText: "Please come back in a few minutes or ask the staff at the counter.",
    takeTicket: "Get a queue ticket",
    codeHint: "Enter the daily code shown on the counter display.",
    codeAutoHint: "The daily code was filled automatically. Just enter your name.",
    dailyCode: "Daily code (4 digits)",
    yourName: "Your name",
    namePlaceholder: "e.g. Alex",
    getTicket: "Get ticket",
    checkingTicket: "Checking your ticket…",
    staffLogin: "Staff login",
    username: "Username",
    password: "Password",
    login: "Log in",
    staff: "Staff",
    owner: "Owner",
    shopDisplay: "Shop display",
    customerPage: "Customer page",
    settings: "Settings",
    logout: "Log out",
    next: "NEXT",
    absent: "NO-SHOW",
    undo: "UNDO",
    currentCode: "Current daily code",
    today: "Today",
    waitingList: "Waiting list",
    noWaiting: "No customers are waiting.",
    missed: "Missed calls",
    none: "None.",
    recentlyDone: "Recently served",
    noRecent: "None.",
    recall: "Recall",
    manual: "Manual",
    shortcuts: "Shortcuts",
    language: "Language",
    manageQueue: "Manage the shop queue",
  },
} as const;

type TranslationKey = keyof typeof translations.vi;
type I18nContextValue = { language: Language; setLanguage: (language: Language) => void; t: (key: TranslationKey) => string };

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("pb_language");
    if (saved === "vi" || saved === "en") setLanguage(saved);
  }, []);

  function changeLanguage(next: Language) {
    setLanguage(next);
    window.localStorage.setItem("pb_language", next);
  }

  const value = useMemo(
    () => ({ language, setLanguage: changeLanguage, t: (key: TranslationKey) => translations[language][key] }),
    [language],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
