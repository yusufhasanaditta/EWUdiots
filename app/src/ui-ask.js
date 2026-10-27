/* Ask EWUdiots: chat screen for the on-device assistant (src/assistant.js). The conversation lives in memory only. */
import { createAssistant } from "./assistant.js";

export function install(ctx) {
  const { pages, icon, esc, $, $$ } = ctx;
  const bot = createAssistant(ctx);
  const chat = []; // { who: "me" | "bot", text, cards, actions }
  let thinking = false;
  const bubble = (m, i) => m.who === "me" ? `<div class="msg me"><p>${esc(m.text)}</p></div>`
    : `<div class="msg bot"><span class="bot-av" aria-hidden="true">${icon("sparkle", "sm")}</span><div class="grow min0"><p>${m.text}</p>
        ${m.cards?.length ? `<div class="ans-cards">${m.cards.map((c) => `<a class="ans-card" href="${esc(c.href || "#/ask")}"${/^https?:/.test(c.href || "") ? ' target="_blank" rel="noopener"' : ""}><span class="itile sm ${c.tone}">${icon(c.icon)}</span><span class="min0"><b>${esc(c.title)}</b>${c.sub ? `<span>${esc(c.sub)}</span>` : ""}</span></a>`).join("")}</div>` : ""}
        ${m.actions?.length ? `<div class="row ans-acts">${m.actions.map((a, k) => a.href ? `<a class="btn sm outline" href="${esc(a.href)}">${esc(a.label)}</a>` : `<button class="btn sm primary" data-act="${i}:${k}">${esc(a.label)}</button>`).join("")}</div>` : ""}</div></div>`;

  pages.ask = () => `${ctx.subHead("Ask EWUdiots", "Free assistant · works offline · private", "#/home")}
    <div class="ask-wrap"><div class="ask-log" id="ask-log" aria-live="polite">
      ${chat.length ? chat.map(bubble).join("") : `<div class="ask-hello"><span class="ask-orb" aria-hidden="true">${icon("sparkle")}</span><h2>Hi${ctx.S.profile?.name ? `, ${esc(ctx.firstName())}` : ""}! What do you need?</h2><p class="small muted">I know your routine, rooms, teachers, grades, deadlines, fees, notices, news and alumni. Everything stays on this device.</p></div>`}
      ${thinking ? `<div class="msg bot"><span class="bot-av">${icon("sparkle", "sm")}</span><div class="typing"><i></i><i></i><i></i></div></div>` : ""}</div>
      <div class="ask-sugg">${bot.suggestions().map((s) => `<button class="chip" data-sg="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      <form class="ask-bar" id="ask-f"><label class="sr-only" for="ask-q">Your question</label><input class="input" id="ask-q" autocomplete="off" placeholder="Ask about classes, rooms, teachers…" maxlength="200"><button class="btn primary icon-only" aria-label="Send">${icon("arrow")}</button></form></div>`;
  pages.ask.mount = (el) => {
    const log = $("#ask-log", el); log.scrollTop = log.scrollHeight;
    const ask = async (text) => {
      text = String(text || "").trim(); if (!text || thinking) return;
      chat.push({ who: "me", text }); thinking = true; ctx.rerender();
      const [r] = await Promise.all([bot.answer(text), new Promise((ok) => setTimeout(ok, 350))]);
      thinking = false; if (r) chat.push({ who: "bot", ...r }); if (chat.length > 60) chat.splice(0, chat.length - 60);
      const auto = r?.actions?.find((a) => a.auto); ctx.rerender(); if (auto) setTimeout(() => ctx.go(auto.href), 500);
      setTimeout(() => $("#ask-q")?.focus(), 30);
    };
    $("#ask-f", el).addEventListener("submit", (e) => { e.preventDefault(); ask($("#ask-q", el).value); });
    $$("[data-sg]", el).forEach((b) => b.addEventListener("click", () => ask(b.dataset.sg)));
    $$("[data-act]", el).forEach((b) => b.addEventListener("click", async () => {
      const [i, k] = b.dataset.act.split(":").map(Number), a = chat[i]?.actions?.[k]; if (!a?.run) return;
      chat[i].actions = []; const r = await a.run(); if (r) chat.push({ who: "bot", ...r }); ctx.rerender();
    }));
    const pre = ctx.qparam("q"); if (pre && !chat.length) ask(pre);
  };
  return { ask: (q) => ctx.go(`#/ask?q=${encodeURIComponent(q)}`) };
}
