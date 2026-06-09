import Link from "next/link";
import type { Metadata } from "next";
import { Mail, MapPin, ArrowRight, Info } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/public-page-header";

export const metadata: Metadata = {
  title: "Contact Us — SaleDock Cloud POS",
  description: "Get in touch with the SaleDock Cloud POS team. Connect on WhatsApp, email, or social media.",
};

const socialLinks = [
  {
    name: "Instagram",
    url: "https://instagram.com/fardan.aatir",
    ariaLabel: "Follow Fardan Aatir on Instagram",
    bgColor: "hover:bg-[#E1306C] hover:text-white",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    )
  },
  {
    name: "Snapchat",
    url: "https://www.snapchat.com/add/fardan.aatir?share_id=uX6jexK6T6-3O0EO3TB5KQ&locale=en_US",
    ariaLabel: "Add Fardan Aatir on Snapchat",
    bgColor: "hover:bg-[#FFFC00] hover:text-black",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12.003 2.1a7.994 7.994 0 0 0-7.852 7.036c-.1 1.25.13 2.378.69 3.23.076.115.114.254.114.394 0 1.228-.68 2.21-1.642 2.766a.465.465 0 0 0-.256.417c.002.392.355.674.72.674h.478c1.196 0 2.202.738 2.613 1.83.18.477.585.807 1.096.807a1.034 1.034 0 0 0 .19-.016c2.474-.46 5.034-.46 7.508 0a1.035 1.035 0 0 0 .19.016c.51 0 .917-.33 1.097-.807.41-1.092 1.417-1.83 2.612-1.83h.478c.366 0 .72-.282.72-.674a.466.466 0 0 0-.256-.417c-.962-.556-1.642-1.538-1.642-2.766 0-.14.038-.28.114-.394.56-.852.79-1.98.69-3.23A7.994 7.994 0 0 0 12.003 2.1zm.006 1.76a4.41 4.41 0 0 1 4.394 4.393 4.41 4.41 0 0 1-4.394 4.394 4.41 4.41 0 0 1-4.394-4.394A4.41 4.41 0 0 1 12.009 3.86z"/>
      </svg>
    )
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/in/fardanaatir/",
    ariaLabel: "Connect with Fardan Aatir on LinkedIn",
    bgColor: "hover:bg-[#0077B5] hover:text-white",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
      </svg>
    )
  },
  {
    name: "X (Twitter)",
    url: "https://x.com/FardanAatir",
    ariaLabel: "Follow Fardan Aatir on X",
    bgColor: "hover:bg-[#000000] hover:text-white dark:hover:bg-[#ffffff] dark:hover:text-black",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    )
  },
  {
    name: "GitHub",
    url: "https://github.com/starwalker12/",
    ariaLabel: "View starwalker12 repositories on GitHub",
    bgColor: "hover:bg-[#24292e] hover:text-white dark:hover:bg-[#ffffff] dark:hover:text-black",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
      </svg>
    )
  },
  {
    name: "Facebook",
    url: "https://www.facebook.com/fardan.aatir",
    ariaLabel: "Connect with Fardan Aatir on Facebook",
    bgColor: "hover:bg-[#1877F2] hover:text-white",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12z"/>
      </svg>
    )
  },
  {
    name: "Facebook Messenger",
    url: "https://m.me/fardan.aatir",
    ariaLabel: "Chat with Fardan Aatir on Facebook Messenger",
    bgColor: "hover:bg-[#00B2FF] hover:text-white",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.914 1.448 5.514 3.722 7.147.195.14.31.36.31.598v2.54a.75.75 0 0 0 1.25.562l2.673-2.385a.75.75 0 0 1 .5-.195c.5.048 1.02.074 1.545.074 5.523 0 10-4.146 10-9.259C22 6.145 17.523 2 12 2zm1.6 11.96-2.124-2.26a.5.5 0 0 0-.728.012L7.3 13.565c-.473.52-.962-.128-.655-.584l3.447-5.126a.5.5 0 0 1 .726-.013l2.126 2.26a.5.5 0 0 0 .728-.012l3.448-3.854c.473-.52.962.128.655.584l-3.447 5.126a.5.5 0 0 1-.728.014z"/>
      </svg>
    )
  },
  {
    name: "Linktree",
    url: "https://linktr.ee/Fardan.Aatir",
    ariaLabel: "View Fardan Aatir Links on Linktree",
    bgColor: "hover:bg-[#39E09B] hover:text-black",
    icon: (
      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
        <path d="M13.511 5.853l4.005-4.117 2.325 2.385-3.925 4.034 5.022.952-1.155 3.39-5.85-2.22v9.718h-3.866v-9.718l-5.85 2.22-1.155-3.39 5.022-.952-3.925-4.034 2.325-2.385 4.005 4.117v-5.85h3.866v5.85z"/>
      </svg>
    )
  }
];

export default function ContactPage() {
  const whatsappUrl = `https://wa.me/923104666026?text=${encodeURIComponent("Hi there, Fardan.")}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-900">
      <article className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-[#fff] p-6 shadow-xl sm:p-10 dark:border-slate-700 dark:bg-slate-800">
        <PublicPageHeader />
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/saledock-logo-full.png"
              alt="SaleDock Cloud POS"
              className="mx-auto mb-2 h-10 w-auto max-w-[180px] object-contain dark:brightness-0 dark:invert"
            />
          </Link>
        </div>

        <h1 className="mb-6 text-2xl font-black text-slate-950 sm:text-3xl dark:text-white flex items-center gap-2">
          <Mail className="h-6 w-6 text-blue-700 dark:text-blue-400" />
          Contact Us
        </h1>

        <section className="space-y-8 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <p>
            Have a question, feedback, or need help setting up your shop? Get in touch with us using any of the channels below. We are here to help you get the most out of SaleDock.
          </p>

          {/* Primary Contact Buttons */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Chat with Fardan on WhatsApp"
              className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-[#25D366] text-white font-bold transition hover:opacity-95 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.459h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              <span>Chat on WhatsApp</span>
            </a>

            <a
              href="mailto:fardan.aatir@outlook.com"
              aria-label="Email Fardan at fardan.aatir@outlook.com"
              className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-slate-900 text-white font-bold transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <span>Email Us</span>
            </a>

            <a
              href="tel:+923104666026"
              aria-label="Call us at +923104666026"
              className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-slate-900 text-white font-bold transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2v3a2 2 0 0 0 2 2 8 8 0 0 0 4.13 1.25l1.9-1.9a2 2 0 0 1 2.33-.24 12.06 12.06 0 0 0 5.3 5.3 2 2 0 0 1-.24 2.33l-1.9 1.9a2 2 0 0 0 1.25 4.13z"/>
              </svg>
              <span>Call Us</span>
            </a>

            <a
              href="sms:+923104666026"
              aria-label="Text us via SMS at +923104666026"
              className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-slate-900 text-white font-bold transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-md hover:shadow-lg active:scale-[0.98] cursor-pointer"
            >
              <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Text Us (SMS)</span>
            </a>
          </div>

          {/* Social Links Grid */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-950 dark:text-white border-b border-slate-100 pb-2 dark:border-slate-700">
              Find Us on Social Media
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.ariaLabel}
                  className={`flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 text-slate-600 transition duration-200 ${social.bgColor} dark:border-slate-700 dark:text-slate-300 dark:hover:border-transparent cursor-pointer`}
                >
                  {social.icon}
                  <span className="text-xs font-semibold">{social.name}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Location and Map */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-700 dark:text-blue-400" />
              Our Location
            </h2>
            <p>
              We are located at Beaconhouse National University, Lahore, Pakistan. You can view our location on the map below:
            </p>

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <iframe
                title="Beaconhouse National University Lahore Map"
                src="https://maps.google.com/maps?q=Beaconhouse%20National%20University%20Lahore&z=15&output=embed"
                width="100%"
                height="300"
                style={{ border: 0 }}
                allowFullScreen={false}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="flex justify-between items-center text-xs">
              <Link
                href="/about"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-400 flex items-center gap-1"
              >
                <Info className="h-3.5 w-3.5" />
                Read About Us
              </Link>
              <a
                href="https://www.google.com/maps/search/?api=1&query=Beaconhouse+National+University+Lahore"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-700 hover:underline dark:text-blue-400 flex items-center gap-1"
              >
                Open in Google Maps
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Footer links */}
          <div className="border-t border-slate-200 pt-5 text-center dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400 dark:text-slate-500">
              <Link href="/privacy" className="hover:text-blue-700 dark:hover:text-blue-400">Privacy Policy</Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/terms" className="hover:text-blue-700 dark:hover:text-blue-400">Terms of Service</Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/data-deletion" className="hover:text-blue-700 dark:hover:text-blue-400">Data Deletion</Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
