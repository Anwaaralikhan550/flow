"use client";

import { MessageCircle, Phone, X } from "lucide-react";
import { useState } from "react";

export function SupportButton() {
  const [isOpen, setIsOpen] = useState(false);
  const phoneNumber = "+923475505054";
  const whatsappUrl = "https://wa.me/923475505054?text=Hi%20Admin%2C%20I%20need%20support%20for%20Vidgen.";

  return (
    <div id="support" className="fixed bottom-5 right-5 z-50 md:bottom-7 md:right-7">
      {isOpen ? (
        <div
          id="support-menu"
          className="mb-3 w-[min(320px,calc(100vw-40px))] overflow-hidden rounded-3xl border border-white/15 bg-[#07120d]/95 text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] ring-1 ring-[#25D366]/35 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#25D366]">WhatsApp Support</p>
              <p className="mt-1 text-sm font-semibold text-white/70">Contact admin directly</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close support menu"
            >
              <X size={18} />
            </button>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-4 py-4 transition hover:bg-white/10"
            aria-label={`Contact admin on WhatsApp at ${phoneNumber}`}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-[#25D366] text-[#03160a] shadow-[0_14px_36px_rgba(37,211,102,0.32)]">
              <Phone size={21} strokeWidth={2.7} />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-black tracking-[-0.02em]">Admin</span>
              <span className="mt-1 block text-sm font-semibold text-white/72">{phoneNumber}</span>
            </span>
          </a>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-controls="support-menu"
        className="inline-flex h-12 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-black text-[#04140a] shadow-[0_16px_40px_rgba(37,211,102,0.35)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[#25D366]/35"
      >
        <MessageCircle size={19} />
        <span className="hidden sm:inline">WhatsApp Support</span>
        <span className="sm:hidden">Support</span>
      </button>
    </div>
  );
}
